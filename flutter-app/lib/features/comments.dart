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
import '../shared/widgets.dart';
import 'repository.dart';

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
    changes = ref.read(repositoryProvider).cache.events.listen((e) {
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
    });
    load();
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
      setState(() {
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
      });
    } catch (e) {
      if (mounted && e is! SessionChanged && e is! CacheSuperseded) {
        setState(() => error = e);
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
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
                '/articles/${widget.articleId}/comments',
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
          .request('/comments/${c.id}', method: 'DELETE');
      if (mounted) setState(() => items.removeWhere((e) => e.id == c.id));
    } catch (e) {
      if (mounted) notice(context, e);
    }
  }

  Widget footer(ApiComment c) => Wrap(
    spacing: 20,
    crossAxisAlignment: WrapCrossAlignment.center,
    children: [
      Text(c.createdAt?.split('T').first ?? '', style: context.text.labelSmall),
      TextButton(
        style: TextButton.styleFrom(
          minimumSize: const Size(0, 28),
          padding: const EdgeInsets.symmetric(vertical: 4),
          foregroundColor: context.colors.textMuted,
          textStyle: const TextStyle(fontSize: 11),
        ),
        onPressed: () => setState(() => reply = c),
        child: const Text('回复'),
      ),
      if (c.userId == ref.read(sessionProvider).user?.id)
        TextButton(onPressed: () => remove(c), child: const Text('删除')),
    ],
  );

  Widget replyBlock(ApiComment c) {
    final parent = items.where((p) => p.id == c.parentId).firstOrNull;
    return Container(
      key: ValueKey('reply-${c.id}'),
      margin: const EdgeInsets.only(top: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: context.colors.surfaceSunken,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            '回复 ${parent?.userName ?? '原评论暂不可见'}',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w500,
              color: context.colors.brand,
            ),
          ),
          if (parent != null)
            Container(
              margin: const EdgeInsets.only(top: 5),
              padding: const EdgeInsets.only(left: 9),
              decoration: BoxDecoration(
                border: Border(
                  left: BorderSide(color: context.colors.lineStrong, width: 2),
                ),
              ),
              child: Text(
                parent.content ?? '',
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 12.5,
                  height: 1.7,
                  color: context.colors.textMuted,
                ),
              ),
            ),
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: SelectableText(
              c.content ?? '',
              style: TextStyle(
                fontSize: 13.5,
                height: 1.75,
                color: context.colors.textBody,
              ),
            ),
          ),
          footer(c),
        ],
      ),
    );
  }

  Widget thread(int id, List<ApiComment> comments) {
    final root = comments.where((c) => c.id == id).firstOrNull;
    final replies = comments.where((c) => c.id != id).toList();
    final shown = expanded.contains(id) ? replies : replies.take(3);
    return Container(
      key: ValueKey('comment-thread-$id'),
      padding: const EdgeInsets.symmetric(vertical: 16),
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: context.colors.line)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CircleAvatar(
            radius: 14,
            backgroundColor: context.colors.brandSubtle,
            foregroundColor: context.colors.brandOnSubtle,
            child: Text(
              (root?.userName?.isNotEmpty == true ? root!.userName! : '会员')
                  .characters
                  .first,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  root == null ? '原评论暂不可见' : root.userName ?? '会员',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: context.colors.textBody,
                  ),
                ),
                if (root != null) ...[
                  Padding(
                    padding: const EdgeInsets.only(top: 6, bottom: 8),
                    child: SelectableText(
                      root.content ?? '',
                      style: TextStyle(
                        fontSize: 13.5,
                        height: 1.75,
                        color: context.colors.textBody,
                      ),
                    ),
                  ),
                  footer(root),
                ],
                for (final c in shown) replyBlock(c),
                if (replies.length > 3)
                  TextButton(
                    onPressed: () => setState(
                      () => expanded.contains(id)
                          ? expanded.remove(id)
                          : expanded.add(id),
                    ),
                    child: Text(
                      expanded.contains(id)
                          ? '收起回复'
                          : '展开 ${replies.length - 3} 条回复',
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
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
        for (final e in groups.entries) thread(e.key, e.value),
        if (error != null) StateMessage(error: error, onRetry: load),
        if (busy) const Center(child: CircularProgressIndicator()),
        if (!busy && more && !pendingUpdate)
          TextButton(onPressed: load, child: const Text('加载更多评论')),
        if (!busy && items.isEmpty && error == null)
          const Padding(
            padding: EdgeInsets.all(16),
            child: Text('还没有评论，分享你的想法吧。'),
          ),
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
