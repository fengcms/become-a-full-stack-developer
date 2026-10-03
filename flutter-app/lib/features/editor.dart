import 'data/reader_models.dart';
import '../shared/widgets/confirm.dart';

import 'package:fullstack_reader/core/network/endpoints.dart';
import 'package:fullstack_reader/app/theme/app_theme.dart';

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

import 'package:fullstack_reader/shared/widgets/notice.dart';
import 'package:fullstack_reader/shared/widgets/reader_context.dart';
import 'package:fullstack_reader/shared/widgets/reader_image.dart';
import 'package:fullstack_reader/shared/widgets/state_message.dart';
import 'package:fullstack_reader/shared/widgets/status_badge.dart';
import 'package:fullstack_reader/shared/widgets/submit_button.dart';

part 'editor/editor_modes.dart';
part 'editor/editor_preview.dart';
part 'editor/markdown_toolbar.dart';
part 'editor/editor_form.dart';
part 'editor/editor_save_bar.dart';
part 'editor/editor_body.dart';
part 'editor/editor_metadata.dart';
part 'editor/editor_payload.dart';
part 'editor/recover_draft.dart';

part 'editor/editor_scaffold.dart';

/// 投稿表单拥有控制器和串行草稿写入队列，网络失败不丢弃本机内容。
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
      final recovery = await recoverDraft(prefs, draftKey, context);
      if (recovery != null && mounted) {
        apply(recovery);
        setState(() => dirty = true);
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

  void insert(String before, String after) =>
      wrapSelection(content, before, after);

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
      final payload = editorPayload(
        title: title.text,
        summary: summary.text,
        content: content.text,
        category: category,
        cover: cover,
        tags: tags.text,
        isNew: id == null,
        submit: submit,
      );
      final oldKey = draftKey;
      final wasNew = id == null;
      var a = Article.fromJson(
        jsonMap(
          await repo.api.request(
            id == null ? Endpoints.articles : Endpoints.article(id!),
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
        await repo.api.request(Endpoints.submit(id!), method: 'POST');
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
    builder: (_) => _EditorMetadata(
      category: category,
      categories: flattenCategories(categories),
      tags: tags,
      getCover: () => cover,
      onCategory: (value) {
        category = value;
        changed();
      },
      removeCover: () {
        setState(() => cover = '');
        changed();
      },
      pickCover: () => pick(true),
    ),
  );

  Widget editorBody() => _EditorBody(
    modes: _EditorModes(
      preview: preview,
      length: content.text.length,
      onMode: (mode) => setState(() => preview = mode),
    ),
    progress: progress,
    uploadFailed: failedUpload != null,
    busy: busy,
    retryUpload: () => upload(failedUpload!, failedCover),
    preview: preview,
    previewBody: _EditorPreview(
      title: title.text,
      summary: summary.text,
      content: content.text,
      nickname: ref.read(sessionProvider).user?.nickname ?? "会员",
    ),
    form: _EditorForm(
      status: status,
      dirty: dirty,
      id: id,
      title: title,
      summary: summary,
      content: content,
      toolbar: _MarkdownToolbar(insert: insert, pickImage: () => pick(false)),
    ),
    saveBar: _EditorSaveBar(status: status, busy: busy, save: save),
  );

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: allowLeave || (!dirty && !busy),
    onPopInvokedWithResult: (didPop, result) {
      if (!didPop) leave();
    },
    child: _EditorScaffold(
      id: id,
      leave: leave,
      metadata: metadata,
      loaded: loaded,
      error: error,
      load: load,
      body: editorBody(),
    ),
  );
}
