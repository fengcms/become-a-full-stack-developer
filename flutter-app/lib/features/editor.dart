import '../shared/prototype_icons.dart';

import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../app/session.dart';
import '../core/generated/models.dart';
import '../core/markdown/reader_markdown.dart';
import '../core/network/api_client.dart';
import '../core/storage/upload.dart';
import '../shared/widgets.dart';
import 'repository.dart';

class EditorPage extends ConsumerStatefulWidget {
  const EditorPage({super.key, this.id});
  final String? id;
  @override
  ConsumerState<EditorPage> createState() => _EditorPageState();
}

class _EditorPageState extends ConsumerState<EditorPage> {
  final title = TextEditingController(),
      summary = TextEditingController(),
      content = TextEditingController(),
      tags = TextEditingController();
  late final SharedPreferences prefs;
  late final int owner;
  int? id, category;
  String status = 'draft', cover = '', updatedAt = '';
  bool loaded = false,
      busy = false,
      dirty = false,
      preview = false,
      allowLeave = false,
      applying = false;
  Object? error;
  List<ApiCategoryNode> categories = [];
  Timer? timer;
  Future<void> draftWrite = Future.value();
  double? progress;
  XFile? failedUpload;
  bool failedCover = false;
  String get draftKey =>
      'draft.${Uri.parse(ref.read(sessionProvider).api.baseUrl).authority}.$owner.${id ?? 'new'}';
  @override
  void initState() {
    super.initState();
    final session = ref.read(sessionProvider);
    prefs = session.preferences;
    owner = session.user!.id!;
    id = int.tryParse(widget.id ?? '');
    for (final c in [title, summary, content, tags]) {
      c.addListener(changed);
    }
    load();
  }

  Map<String, dynamic> draft() => {
    'title': title.text,
    'summary': summary.text,
    'content': content.text,
    'tags': tags.text,
    'categoryId': category,
    'coverImage': cover,
    'baseUpdatedAt': updatedAt,
  };
  Future<void> persist() {
    final value = jsonEncode(draft()), key = draftKey;
    draftWrite = draftWrite.catchError((Object _) {}).then((_) async {
      await prefs.setString(key, value);
    });
    return draftWrite;
  }

  void changed() {
    if (applying || !loaded) return;
    setState(() => dirty = true);
    timer?.cancel();
    timer = Timer(const Duration(milliseconds: 500), () {
      persist().catchError((Object e) {
        if (mounted) notice(context, '本机草稿保存失败，请尽快保存到服务器');
      });
    });
  }

  void apply(Map<String, dynamic> j) {
    applying = true;
    title.text = j['title'] ?? '';
    summary.text = j['summary'] ?? '';
    content.text = j['content'] ?? '';
    tags.text = j['tags'] is List
        ? (j['tags'] as List).join(', ')
        : j['tags'] ?? '';
    category = j['categoryId'] as int?;
    cover = j['coverImage'] ?? '';
    applying = false;
  }

  Future<void> load() async {
    try {
      final repo = ref.read(repositoryProvider);
      categories = await repo.categories();
      if (!mounted) return;
      if (id != null) {
        final a = await repo.article(id.toString(), private: true);
        if (!mounted) return;
        if (a.data.authorId != owner) {
          throw const ApiFailure('只能编辑自己的稿件', code: 2001);
        }
        apply(a.data.json);
        applying = true;
        content.text = a.content;
        applying = false;
        status = a.status;
        updatedAt = a.data.updatedAt ?? '';
      }
      if (!mounted) return;
      setState(() => loaded = true);
      final cached = prefs.getString(draftKey);
      if (cached != null && mounted) {
        Map<String, dynamic>? recovery;
        try {
          recovery = jsonMap(jsonDecode(cached));
        } catch (_) {
          await prefs.remove(draftKey);
        }
        if (recovery != null &&
            mounted &&
            await confirm(context, '恢复本机草稿', '发现上次未保存的内容，是否恢复？服务器稿件不会立即被修改。') &&
            mounted) {
          apply(recovery);
          setState(() => dirty = true);
        }
      }
      final lost = await ImagePicker().retrieveLostData();
      if (!lost.isEmpty && lost.files?.isNotEmpty == true && mounted) {
        await upload(lost.files!.first, false);
      }
    } catch (e) {
      if (mounted) setState(() => error = e);
    }
  }

  @override
  void dispose() {
    timer?.cancel();
    if (dirty) {
      persist().catchError((Object _) {
        /* No UI remains to report a storage failure. */
      });
    }
    for (final c in [title, summary, content, tags]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> leave() async {
    if (busy) {
      notice(context, '正在保存或上传，请稍候');
      return;
    }
    if (dirty) {
      await persist();
      if (!mounted || !await confirm(context, '离开编辑器', '未保存内容已保留在本机，是否离开？')) {
        return;
      }
    }
    if (!mounted) return;
    setState(() => allowLeave = true);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        if (context.canPop()) {
          context.pop();
        } else {
          context.go('/member/articles');
        }
      }
    });
  }

  List<ApiCategoryNode> flatten(List<ApiCategoryNode> nodes) => [
    for (final n in nodes) ...[n, ...flatten(n.children)],
  ];
  void insert(String before, String after) {
    final s = content.selection;
    final start = s.isValid ? s.start : content.text.length,
        end = s.isValid ? s.end : content.text.length;
    final selected = content.text.substring(start, end);
    content.value = TextEditingValue(
      text: content.text.replaceRange(start, end, '$before$selected$after'),
      selection: TextSelection.collapsed(
        offset: start + before.length + selected.length,
      ),
    );
  }

  Future<void> pick(bool isCover) async {
    try {
      final file = await ImagePicker().pickImage(source: ImageSource.gallery);
      if (file != null) await upload(file, isCover);
    } catch (e) {
      if (mounted) notice(context, e);
    }
  }

  Future<void> upload(XFile file, bool isCover) async {
    setState(() {
      busy = true;
      progress = 0;
      failedUpload = null;
    });
    try {
      final url = await uploadImage(
        ref.read(sessionProvider).api,
        file,
        onProgress: (n, total) {
          if (mounted) setState(() => progress = total == 0 ? null : n / total);
        },
      );
      if (!mounted) return;
      if (isCover) {
        setState(() => cover = url);
        changed();
      } else {
        insert('\n![图片]($url)\n', '');
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          failedUpload = file;
          failedCover = isCover;
        });
        notice(context, e);
      }
    } finally {
      if (mounted) {
        setState(() {
          busy = false;
          progress = null;
        });
      }
    }
  }

  Future<void> save(bool submit) async {
    if (title.text.trim().isEmpty || content.text.trim().isEmpty) {
      notice(context, '请填写标题和正文');
      return;
    }
    if (status == 'published' &&
        !await confirm(context, '修改已发布文章', '保存后文章将重新进入待审核，确认继续？')) {
      return;
    }
    setState(() => busy = true);
    timer?.cancel();
    try {
      await persist();
      if (!mounted) return;
      final repo = ref.read(repositoryProvider);
      if (id != null) {
        final latest = await repo.article(id.toString(), private: true);
        if (latest.data.updatedAt != updatedAt) {
          if (mounted) notice(context, '服务器稿件已变化。本机内容已保留，请退出重进后核对再保存。');
          return;
        }
      }
      final payload = <String, dynamic>{
        'title': title.text.trim(),
        'summary': summary.text.trim(),
        'content': content.text,
        'categoryId': category,
        'coverImage': cover.isEmpty ? null : cover,
        'tags': tags.text
            .split(RegExp('[,，]'))
            .map((s) => s.trim())
            .where((s) => s.isNotEmpty)
            .toSet()
            .toList(),
        if (id == null) 'status': submit ? 'pending' : 'draft',
      };
      final oldKey = draftKey;
      final wasNew = id == null;
      var a = Article.fromJson(
        jsonMap(
          await repo.api.request(
            id == null ? '/articles' : '/articles/$id',
            method: id == null ? 'POST' : 'PUT',
            data: payload,
          ),
        ),
      );
      id = a.id;
      status = a.status;
      updatedAt = a.data.updatedAt ?? '';
      if (wasNew) {
        await draftWrite;
        await prefs.remove(oldKey);
        await persist();
      }
      if (wasNew && status != (submit ? 'pending' : 'draft')) {
        throw const ApiFailure('服务器返回的稿件状态与操作不一致，请在我的文章中核对');
      }
      if (submit && status == 'draft') {
        await repo.api.request('/articles/$id/submit', method: 'POST');
        a = await repo.article(id.toString(), private: true);
        status = a.status;
        updatedAt = a.data.updatedAt ?? '';
        if (status != 'pending') throw const ApiFailure('送审状态未确认，请刷新稿件');
      }
      await draftWrite;
      await prefs.remove(draftKey);
      if (!mounted) return;
      setState(() => dirty = false);
      notice(
        context,
        submit
            ? '已提交审核'
            : status == 'pending'
            ? '已保存，当前待审核'
            : '草稿已保存',
      );
    } catch (e) {
      if (mounted) notice(context, e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> metadata() => showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (c) => StatefulBuilder(
      builder: (c, refresh) => SafeArea(
        child: SingleChildScrollView(
          padding: EdgeInsets.fromLTRB(
            16,
            0,
            16,
            16 + MediaQuery.viewInsetsOf(c).bottom,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('发布信息', style: context.text.titleMedium),
              const SizedBox(height: 16),
              DropdownButtonFormField<int>(
                initialValue: category,
                decoration: const InputDecoration(labelText: '分类'),
                items: [
                  const DropdownMenuItem<int>(value: null, child: Text('未分类')),
                  for (final n in flatten(categories))
                    DropdownMenuItem(value: n.id, child: Text(n.name ?? '')),
                ],
                onChanged: (v) {
                  category = v;
                  changed();
                },
              ),
              const SizedBox(height: 16),
              TextField(
                controller: tags,
                decoration: const InputDecoration(
                  labelText: '标签',
                  hintText: '用逗号分隔',
                ),
              ),
              const SizedBox(height: 12),
              if (cover.isNotEmpty)
                Stack(
                  children: [
                    ReaderImage(cover, height: 140, width: double.infinity),
                    Positioned(
                      right: 0,
                      top: 0,
                      child: IconButton(
                        tooltip: '移除封面',
                        onPressed: () {
                          setState(() => cover = '');
                          refresh(() {});
                          changed();
                        },
                        icon: const ReaderIcon(Icons.close),
                      ),
                    ),
                  ],
                ),
              OutlinedButton.icon(
                onPressed: () async {
                  await pick(true);
                  refresh(() {});
                },
                icon: const ReaderIcon(Icons.image_outlined),
                label: Text(cover.isEmpty ? '上传封面' : '更换封面'),
              ),
              const SizedBox(height: 12),
            ],
          ),
        ),
      ),
    ),
  );

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: allowLeave || (!dirty && !busy),
    onPopInvokedWithResult: (didPop, result) {
      if (!didPop) leave();
    },
    child: Scaffold(
      appBar: AppBar(
        leading: IconButton(
          tooltip: '返回',
          onPressed: leave,
          icon: const ReaderIcon(Icons.arrow_back),
        ),
        title: Text(id == null ? '写文章' : '编辑稿件'),
        actions: [
          IconButton(
            tooltip: '发布信息',
            onPressed: metadata,
            icon: const PrototypeIcon('more'),
          ),
        ],
      ),
      body: !loaded
          ? (error == null
                ? const Center(child: CircularProgressIndicator())
                : StateMessage(error: error, onRetry: load))
          : SafeArea(
              child: Column(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 12,
                    ),
                    decoration: BoxDecoration(
                      border: Border(
                        bottom: BorderSide(color: context.colors.line),
                      ),
                    ),
                    child: Row(
                      children: [
                        for (final mode in [false, true])
                          OutlinedButton(
                            style: OutlinedButton.styleFrom(
                              backgroundColor: preview == mode
                                  ? context.colors.brandSubtle
                                  : context.colors.surface,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(6),
                              ),
                            ),
                            onPressed: () => setState(() => preview = mode),
                            child: Text(mode ? '预览' : '编辑'),
                          ),
                        const Spacer(),
                        Text(
                          '${content.text.length} / 65535',
                          style: context.text.labelSmall,
                        ),
                      ],
                    ),
                  ),
                  if (progress != null)
                    LinearProgressIndicator(value: progress),
                  if (failedUpload != null)
                    ListTile(
                      title: const Text('图片上传失败，正文已保留'),
                      trailing: TextButton(
                        onPressed: busy
                            ? null
                            : () => upload(failedUpload!, failedCover),
                        child: const Text('重试'),
                      ),
                    ),
                  Expanded(
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.all(16),
                      child: AbsorbPointer(
                        absorbing: busy,
                        child: preview
                            ? Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  Text(
                                    title.text,
                                    style: context.text.headlineSmall,
                                  ),
                                  const SizedBox(height: 16),
                                  Row(
                                    children: [
                                      CircleAvatar(
                                        radius: 16,
                                        backgroundColor:
                                            context.colors.brandSubtle,
                                        foregroundColor:
                                            context.colors.brandOnSubtle,
                                        child: const PrototypeIcon(
                                          'user',
                                          size: 18,
                                        ),
                                      ),
                                      const SizedBox(width: 12),
                                      Text(
                                        '${ref.read(sessionProvider).user?.nickname ?? "会员"} · 预览 · 尚未发布',
                                        style: context.text.bodySmall,
                                      ),
                                    ],
                                  ),
                                  if (summary.text.isNotEmpty)
                                    Container(
                                      margin: const EdgeInsets.symmetric(
                                        vertical: 16,
                                      ),
                                      padding: const EdgeInsets.all(16),
                                      color: context.colors.surfaceSunken,
                                      child: Text(
                                        summary.text,
                                        style: context.text.bodySmall,
                                      ),
                                    ),
                                  ReaderMarkdown(
                                    content.text,
                                    publicImages: false,
                                  ),
                                ],
                              )
                            : Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  Row(
                                    children: [
                                      StatusBadge(status),
                                      const SizedBox(width: 12),
                                      Text(
                                        dirty
                                            ? '有未保存的修改'
                                            : id == null
                                            ? '尚未保存'
                                            : '已与服务器同步',
                                        style: context.text.bodySmall,
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 16),
                                  const Text(
                                    '标题 *',
                                    style: TextStyle(
                                      fontSize: 13,
                                      fontWeight: FontWeight.w500,
                                    ),
                                  ),
                                  const SizedBox(height: 7),
                                  TextField(
                                    key: const ValueKey('editor-title'),
                                    controller: title,
                                    maxLength: 200,
                                    decoration: const InputDecoration(
                                      hintText: '不超过 200 字',
                                    ),
                                  ),
                                  const Text(
                                    '摘要',
                                    style: TextStyle(
                                      fontSize: 13,
                                      fontWeight: FontWeight.w500,
                                    ),
                                  ),
                                  const SizedBox(height: 7),
                                  TextField(
                                    controller: summary,
                                    maxLength: 500,
                                    minLines: 2,
                                    maxLines: 4,
                                    decoration: const InputDecoration(
                                      hintText: '一到两句话说清这篇文章解决什么问题',
                                    ),
                                  ),
                                  const Text(
                                    '正文（Markdown）',
                                    style: TextStyle(
                                      fontSize: 13,
                                      fontWeight: FontWeight.w500,
                                    ),
                                  ),
                                  const SizedBox(height: 7),
                                  TextField(
                                    key: const ValueKey('editor-content'),
                                    controller: content,
                                    minLines: 14,
                                    maxLines: null,
                                    maxLength: 65535,
                                    maxLengthEnforcement:
                                        MaxLengthEnforcement.enforced,
                                    style: const TextStyle(
                                      fontFamily: 'monospace',
                                      fontSize: 13,
                                      height: 1.85,
                                    ),
                                    decoration: const InputDecoration(
                                      hintText: '开始写作…',
                                      alignLabelWithHint: true,
                                    ),
                                  ),
                                  Wrap(
                                    spacing: 4,
                                    runSpacing: 4,
                                    children: [
                                      IconButton(
                                        tooltip: '表格',
                                        onPressed: () => insert(
                                          '\n| 标题 | 内容 |\n| --- | --- |\n| ',
                                          ' |  |\n',
                                        ),
                                        icon: const Text('▦'),
                                      ),
                                      IconButton(
                                        tooltip: '列表',
                                        onPressed: () => insert('\n- ', ''),
                                        icon: const Text('≣'),
                                      ),
                                      IconButton(
                                        tooltip: '标题格式',
                                        onPressed: () => insert('\n## ', ''),
                                        icon: const Text(
                                          'H2',
                                          style: TextStyle(
                                            fontFamily: 'monospace',
                                            fontSize: 14,
                                          ),
                                        ),
                                      ),
                                      IconButton(
                                        tooltip: '加粗',
                                        onPressed: () => insert('**', '**'),
                                        icon: const Text(
                                          'B',
                                          style: TextStyle(
                                            fontFamily: 'monospace',
                                            fontSize: 14,
                                          ),
                                        ),
                                      ),
                                      IconButton(
                                        tooltip: '代码块',
                                        onPressed: () =>
                                            insert('\n```\n', '\n```\n'),
                                        icon: const Text(
                                          '</>',
                                          style: TextStyle(
                                            fontFamily: 'monospace',
                                            fontSize: 14,
                                          ),
                                        ),
                                      ),
                                      IconButton(
                                        tooltip: '引用',
                                        onPressed: () => insert('\n> ', ''),
                                        icon: const Text(
                                          '❞',
                                          style: TextStyle(
                                            fontFamily: 'monospace',
                                            fontSize: 14,
                                          ),
                                        ),
                                      ),
                                      IconButton(
                                        tooltip: '链接',
                                        onPressed: () =>
                                            insert('[', '](https://)'),
                                        icon: const Text(
                                          '↗',
                                          style: TextStyle(
                                            fontFamily: 'monospace',
                                            fontSize: 14,
                                          ),
                                        ),
                                      ),
                                      IconButton(
                                        tooltip: '插入图片',
                                        onPressed: () => pick(false),
                                        icon: const ReaderIcon(
                                          Icons.add_photo_alternate_outlined,
                                        ),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                      ),
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: context.colors.surface,
                      border: Border(
                        top: BorderSide(color: context.colors.line),
                      ),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            onPressed: busy ? null : () => save(false),
                            child: Text(status == 'draft' ? '保存草稿' : '保存修改'),
                          ),
                        ),
                        if (status == 'draft') ...[
                          const SizedBox(width: 12),
                          Expanded(
                            child: SubmitButton(
                              label: '提交审核',
                              busy: busy,
                              onPressed: () => save(true),
                            ),
                          ),
                        ],
                        if (status != 'draft' && busy)
                          const Padding(
                            padding: EdgeInsets.all(8),
                            child: CircularProgressIndicator(),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
    ),
  );
}
