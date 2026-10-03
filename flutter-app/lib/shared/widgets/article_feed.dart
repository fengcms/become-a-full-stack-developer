import 'package:fullstack_reader/core/network/endpoints.dart';
import 'package:fullstack_reader/app/theme/app_theme.dart';

import 'dart:async';

import 'package:fullstack_reader/core/cache/data_cache.dart';
import 'package:fullstack_reader/shared/cache_visibility.dart';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:fullstack_reader/app/session.dart';
import 'package:fullstack_reader/core/network/api_client.dart';
import 'package:fullstack_reader/features/repository.dart';

import 'package:fullstack_reader/shared/widgets/article_skeleton.dart';
import 'package:fullstack_reader/shared/widgets/article_tile.dart';
import 'package:fullstack_reader/shared/widgets/reader_context.dart';
import 'package:fullstack_reader/shared/widgets/state_message.dart';

/// 分页列表保存滚动快照；首屏发生变化时提醒刷新，避免新旧页混排。
class ArticleFeed extends ConsumerStatefulWidget {
  const ArticleFeed({
    super.key,
    this.path = Endpoints.articles,
    this.query = const {},
    this.header,
    this.footer,
    this.interlude,
    this.onArticle,
    this.trailing,
    this.showStatus = false,
    this.itemBuilder,
  });
  final Widget Function(Article, VoidCallback)? itemBuilder;
  final String path;
  final Map<String, dynamic> query;
  final Widget? header, footer, interlude;
  final void Function(Article)? onArticle;
  final Widget Function(Article, VoidCallback)? trailing;
  final bool showStatus;
  @override
  ConsumerState<ArticleFeed> createState() => _ArticleFeedState();
}

class _ArticleFeedState extends ConsumerState<ArticleFeed>
    with CacheVisibility<ArticleFeed> {
  final controller = ScrollController();
  StreamSubscription<CacheEvent>? changes;
  late String snapshotKey;
  double savedOffset = 0;
  late ReaderRepository repository;
  bool pendingUpdate = false;
  Set<String> dependencies = {};
  Set<String> get resourceTags => repository.resourceTags(widget.path);
  List<Article> items = [];
  int page = 0;
  bool busy = false, more = true;
  Object? error;
  int serial = 0;
  @override
  // 恢复快照后再校验首屏，避免返回页面时先清空列表和滚动位置。
  void initState() {
    super.initState();
    controller.addListener(() {
      if (controller.hasClients) savedOffset = controller.offset;
    });
    final repo = repository = ref.read(repositoryProvider);
    snapshotKey = repo.key(
      widget.path,
      widget.query,
      private: widget.path.startsWith(Endpoints.privatePrefix),
    );
    final saved = repo.snapshots[snapshotKey];
    final maxAge =
        repo.policy(widget.path)?.maxAge ?? const Duration(minutes: 1);
    if (saved != null && DateTime.now().difference(saved.saved) < maxAge) {
      savedOffset = saved.offset;
      items = List.of(saved.items);
      page = saved.page;
      more = saved.more;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && controller.hasClients) {
          controller.jumpTo(
            saved.offset.clamp(0, controller.position.maxScrollExtent),
          );
        }
      });
    }
    changes = repo.cache.events.listen(onCacheEvent);
    load(check: items.isNotEmpty);
  }

  @override
  void onCacheVisible() {
    if (!busy) load(check: items.isNotEmpty);
  }

  /// 仅可见页面响应缓存事件；失效和请求失败分别处理，避免重复重载。
  void onCacheEvent(CacheEvent e) {
    if (!mounted || !cacheVisible || busy) return;
    if (e.kind == 'patched') {
      setState(() {});
      return;
    }
    if (e.key != '*' && !dependencies.contains(e.key)) return;
    if (e.kind == 'failed' || e.kind == 'removed') {
      setState(() {
        error = e.error;
        if (e.kind == 'removed' || !repository.cache.usable(e.key)) {
          items = [];
          page = 0;
        }
      });
      return;
    }
    if (e.kind == 'cleared') {
      setState(() {
        items = [];
        page = 0;
      });
      load(reset: true);
      return;
    }
    if (e.kind == 'invalidated') {
      load(reset: true);
    } else if (e.kind == 'updated') {
      load(check: true);
    }
  }

  @override
  // 只保存依赖仍可用的分页快照；销毁阶段使用已有仓库引用。
  void dispose() {
    final repo = repository;
    if (items.isNotEmpty &&
        page <= 20 &&
        dependencies.isNotEmpty &&
        dependencies.every(repo.cache.usable)) {
      repo.saveSnapshot(
        snapshotKey,
        FeedSnapshot(
          List.of(items),
          page,
          more,
          controller.hasClients ? controller.offset : savedOffset,
          resourceTags,
          dependencies
              .map(repo.cache.savedAt)
              .whereType<DateTime>()
              .fold<DateTime>(DateTime.now(), (a, b) => a.isBefore(b) ? a : b),
        ),
      );
    }
    changes?.cancel();
    controller.dispose();
    super.dispose();
  }

  Future<void> load({
    bool reset = false,
    bool check = false,
    bool verify = false,
  }) async {
    if (busy && !reset) return;
    if (pendingUpdate && !reset && !check) return;
    final firstKey = repository.key(widget.path, {
      'page': 1,
      'pageSize': 12,
      ...widget.query,
    }, private: widget.path.startsWith(Endpoints.privatePrefix));
    // 翻下一页前先检查首屏是否变化，阻止旧页混入新的排序结果。
    if (page > 0 && !reset && !check && !repository.cache.fresh(firstKey)) {
      await load(check: true, verify: true);
      if (!mounted || pendingUpdate || error != null) return;
    }
    final ticket = ++serial;
    setState(() {
      busy = true;
      error = null;
    });
    final repo = ref.read(repositoryProvider);
    if (reset) repo.cache.invalidate({repo.feedTag(widget.path, widget.query)});
    try {
      final p = await repo.track(
        dependencies,
        () => repo.articles(
          page: reset || check ? 1 : page + 1,
          path: widget.path,
          query: widget.query,
          force: reset || verify,
        ),
      );
      if (!mounted || ticket != serial) return;
      setState(() => _applyPage(p, check, reset));
    } catch (e) {
      if (mounted &&
          ticket == serial &&
          e is! SessionChanged &&
          e is! CacheSuperseded) {
        setState(() {
          error = e;
          if (repo.forbidden(e) ||
              dependencies.any((k) => !repo.cache.usable(k))) {
            items = [];
            page = 0;
          }
        });
      }
    } finally {
      if (mounted && ticket == serial) setState(() => busy = false);
    }
  }

  // 与已展示前缀比较完整摘要，既检测排序也检测内容变化。
  bool _samePrefix(List<Article> next) =>
      next.map((a) => a.data.json.toString()).join() ==
      items.take(next.length).map((a) => a.data.json.toString()).join();

  // 私有列表立即同步，公共列表提示更新；追加页按 ID 去重。
  void _applyPage(PageResult<Article> p, bool check, bool reset) {
    if (check && widget.path.startsWith(Endpoints.privatePrefix)) {
      final differs = !_samePrefix(p.items);
      if (differs) {
        items = List.of(p.items);
        page = p.page;
        more = p.hasMore;
      }
      pendingUpdate = false;
    } else if (check) {
      pendingUpdate = !_samePrefix(p.items);
    } else {
      if (reset) {
        items = [];
        pendingUpdate = false;
      }
      final ids = items.map((e) => e.id).toSet();
      items.addAll(p.items.where((a) => ids.add(a.id)));
      page = p.page;
      more = p.hasMore;
    }
  }

  @override
  Widget build(BuildContext context) => RefreshIndicator(
    onRefresh: () async {
      ref.read(repositoryProvider).cache.invalidate(resourceTags);
      await load(reset: true);
    },
    child: NotificationListener<ScrollNotification>(
      onNotification: (n) {
        if (n.metrics.extentAfter < 350 &&
            more &&
            !busy &&
            !pendingUpdate &&
            error == null) {
          load();
        }
        return false;
      },
      child: ListView(
        controller: controller,
        key: PageStorageKey(snapshotKey),
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          if (pendingUpdate)
            TextButton(
              onPressed: () => load(reset: true),
              child: const Text('有新内容，点击更新'),
            ),
          if (widget.header != null) widget.header!,
          for (var index = 0; index < items.length; index++) ...[
            if (widget.itemBuilder != null)
              widget.itemBuilder!(items[index], () => load(reset: true))
            else
              ArticleTile(
                items[index],
                onTap: widget.onArticle == null
                    ? null
                    : () => widget.onArticle!(items[index]),
                showStatus: widget.showStatus,
                trailing: widget.trailing?.call(
                  items[index],
                  () => load(reset: true),
                ),
              ),
            if (index == 3 && widget.interlude != null) widget.interlude!,
          ],
          if (items.length < 4 && !busy && widget.interlude != null)
            widget.interlude!,
          if (error != null) StateMessage(error: error, onRetry: () => load()),
          if (busy && items.isEmpty) const ArticleSkeleton(count: 2),
          if (!busy && items.isEmpty && error == null) const StateMessage(),
          if (!more && items.isNotEmpty)
            Padding(
              padding: AppInsets.panel,
              child: Center(
                child: Text('已经到底了', style: context.text.bodySmall),
              ),
            ),
          if (widget.footer != null) widget.footer!,
        ],
      ),
    ),
  );
}
