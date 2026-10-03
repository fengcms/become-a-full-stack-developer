import 'package:fullstack_reader/core/network/endpoints.dart';
import 'package:fullstack_reader/app/theme/app_theme.dart';

import 'dart:async';

import '../core/cache/data_cache.dart';
import '../shared/cache_visibility.dart';
import '../shared/prototype_icons.dart';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../app/session.dart';
import '../core/generated/models.dart';
import '../core/network/api_client.dart';

import 'package:fullstack_reader/shared/widgets/confirm.dart';
import 'package:fullstack_reader/shared/widgets/notice.dart';
import 'package:fullstack_reader/shared/widgets/reader_context.dart';
import 'package:fullstack_reader/shared/widgets/section_title.dart';
import 'package:fullstack_reader/shared/widgets/state_message.dart';
import 'package:fullstack_reader/shared/widgets/submit_button.dart';
import 'package:fullstack_reader/features/data/reader_models.dart';

part 'comment_widgets/comment_footer.dart';
part 'comment_widgets/comment_reply.dart';
part 'comment_widgets/comment_thread.dart';

Map<int, List<ApiComment>> groupComments(List<ApiComment> comments) {
  final byId = {for (final c in comments) c.id!: c};
  final groups = <int, List<ApiComment>>{};
  for (final c in comments) {
    var root = c.id!;
    var at = c;
    final seen = <int>{root};
    while (at.parentId != null) {
      final p = at.parentId!;
      if (!seen.add(p)) break;
      root = p;
      final parent = byId[p];
      if (parent == null) break;
      at = parent;
    }
    groups.putIfAbsent(root, () => []).add(c);
  }
  return groups;
}

/// 评论分页与输入草稿各自保留；刷新楼层数据不会清空正在输入的文字。
class Comments extends ConsumerStatefulWidget {
  const Comments(this.articleId, {super.key, this.composerKey});
  final GlobalKey? composerKey;
  final int articleId;
  @override
  ConsumerState<Comments> createState() => _CommentsState();
}

class _CommentsState extends ConsumerState<Comments>
    with CacheVisibility<Comments> {
  StreamSubscription<CacheEvent>? changes;
  final dependencies = <String>{};
  @override
  void onCacheVisible() {
    if (!busy && page > 0) load(check: true);
  }

  final input = TextEditingController();
  List<ApiComment> items = [];
  int page = 0;
  bool busy = false, sending = false, more = true;
  Object? error;
  bool pendingUpdate = false;
  ApiComment? reply;
  final expanded = <int>{};
  @override
  void initState() {
    super.initState();
    changes = ref.read(repositoryProvider).cache.events.listen(onCacheEvent);
    load();
  }

  /// 仅可见页面响应缓存事件；失效和请求失败分别处理，避免重复重载。
  void onCacheEvent(CacheEvent e) {
    if (!mounted ||
        !cacheVisible ||
        busy ||
        sending ||
        (!dependencies.contains(e.key) && e.key != '*')) {
      return;
    }
    if (e.kind == 'failed' || e.kind == 'removed') {
      setState(() {
        error = e.error;
        if (e.kind == 'removed' ||
            !ref.read(repositoryProvider).cache.usable(e.key)) {
          items = [];
        }
      });
      return;
    }
    if (e.kind == 'cleared') {
      setState(() => items = []);
    }
    if (e.kind == 'updated') {
      load(check: true);
    } else if (e.kind != 'patched') {
      load(reset: e.kind == 'invalidated');
    }
  }

  @override
  void dispose() {
    changes?.cancel();
    input.dispose();
    super.dispose();
  }

  Future<void> load({bool reset = false, bool check = false}) async {
    if (busy || (pendingUpdate && !reset && !check)) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final repo = ref.read(repositoryProvider);
      if (reset) repo.cache.invalidate({'comments:${widget.articleId}'});
      final p = await repo.track(
        dependencies,
        () => repo.comments(
          widget.articleId,
          reset || check ? 1 : page + 1,
          force: reset,
        ),
      );
      if (!mounted) return;
      setState(() => applyPage(p, reset: reset, check: check));
    } catch (e) {
      if (mounted && e is! SessionChanged && e is! CacheSuperseded) {
        setState(() => error = e);
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  void applyPage(
    PageResult<ApiComment> p, {
    required bool reset,
    required bool check,
  }) {
    if (reset) {
      items = [];
      pendingUpdate = false;
    }
    if (check && page > 1) {
      pendingUpdate =
          p.items.map((c) => c.json.toString()).join() !=
          items.take(p.items.length).map((c) => c.json.toString()).join();
      final byId = {for (final c in p.items) c.id: c};
      items = items.map((c) => byId[c.id] ?? c).toList();
      return;
    }
    if (check) items = [];
    final ids = items.map((e) => e.id).toSet();
    items.addAll(p.items.where((c) => ids.add(c.id)));
    page = p.page;
    more = p.hasMore;
  }

  Future<void> send() async {
    if (ref.read(sessionProvider).user == null) {
      context.push(
        '/login?from=${Uri.encodeComponent('/articles/${widget.articleId}')}',
      );
      return;
    }
    if (input.text.trim().isEmpty) {
      notice(context, '请填写评论内容');
      return;
    }
    setState(() => sending = true);
    try {
      final c = ApiComment.fromJson(
        jsonMap(
          await ref
              .read(sessionProvider)
              .api
              .request(
                Endpoints.comments(widget.articleId),
                method: 'POST',
                data: {
                  'content': input.text.trim(),
                  if (reply != null) 'parentId': reply!.id,
                },
              ),
        ),
      );
      if (!mounted) return;
      if (c.status == 'approved') {
        setState(() {
          items.add(c);
          reply = null;
          input.clear();
        });
        notice(context, '评论已发布');
      } else {
        notice(context, c.rejectedReason ?? '评论未通过，请修改后重试');
      }
    } catch (e) {
      if (mounted) notice(context, e);
    } finally {
      if (mounted) setState(() => sending = false);
    }
  }

  Future<void> remove(ApiComment c) async {
    if (!await confirm(context, '删除评论', '删除后不可恢复，是否继续？')) return;
    try {
      await ref
          .read(sessionProvider)
          .api
          .request(Endpoints.comment(c.id!), method: 'DELETE');
      if (mounted) setState(() => items.removeWhere((e) => e.id == c.id));
    } catch (e) {
      if (mounted) notice(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final groups = groupComments(items);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SectionTitle('评论'),
        if (pendingUpdate)
          TextButton(
            onPressed: () => load(reset: true),
            child: const Text('评论有更新，点击刷新'),
          ),
        for (final e in groups.entries)
          _CommentThread(
            id: e.key,
            comments: e.value,
            items: items,
            expanded: expanded.contains(e.key),
            onExpand: () => setState(
              () => expanded.contains(e.key)
                  ? expanded.remove(e.key)
                  : expanded.add(e.key),
            ),
            userId: ref.read(sessionProvider).user?.id,
            onReply: (c) => setState(() => reply = c),
            onRemove: remove,
          ),
        if (error != null) StateMessage(error: error, onRetry: load),
        if (busy) const Center(child: CircularProgressIndicator()),
        if (!busy && more && !pendingUpdate)
          TextButton(onPressed: load, child: const Text('加载更多评论')),
        if (!busy && items.isEmpty && error == null)
          const Padding(padding: AppInsets.page, child: Text('还没有评论，分享你的想法吧。')),
        const SizedBox(height: 24),
        if (reply != null)
          ListTile(
            title: Text('回复 ${reply!.userName ?? '会员'}'),
            trailing: IconButton(
              tooltip: '取消回复',
              onPressed: () => setState(() => reply = null),
              icon: const ReaderIcon(Icons.close),
            ),
          ),
        TextField(
          key: widget.composerKey,
          controller: input,
          onTapOutside: (_) => FocusManager.instance.primaryFocus?.unfocus(),
          maxLength: 2000,
          minLines: 3,
          maxLines: 6,
          decoration: const InputDecoration(
            labelText: '写下你的想法',
            hintText: '友善交流，分享实践经验',
          ),
        ),
        Align(
          alignment: Alignment.centerRight,
          child: SubmitButton(
            label: ref.watch(sessionProvider).user == null ? '登录后评论' : '发表评论',
            busy: sending,
            onPressed: send,
          ),
        ),
      ],
    );
  }
}
