import 'dart:async';

import '../core/cache/data_cache.dart';
import 'cache_visibility.dart';
import 'prototype_icons.dart';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../app/session.dart';
import '../app/theme/app_theme.dart';
import '../core/network/api_client.dart';
import '../features/repository.dart';

extension ReaderContext on BuildContext {
  AppColors get colors => Theme.of(this).extension<AppColors>()!;
  TextTheme get text => Theme.of(this).textTheme;
}

void notice(BuildContext context, Object error) {
  if (error is SessionChanged) return;
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      content: Text(error.toString()),
      duration: const Duration(seconds: 2),
      behavior: SnackBarBehavior.floating,
      margin: const EdgeInsets.fromLTRB(16, 8, 16, 76),
    ),
  );
}

Future<bool> confirm(BuildContext context, String title, String body) async =>
    await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text(title),
        content: Text(body),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(c, false),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(c, true),
            child: const Text('确定'),
          ),
        ],
      ),
    ) ??
    false;

class PageFrame extends StatelessWidget {
  const PageFrame({
    super.key,
    required this.title,
    required this.child,
    this.actions = const [],
    this.floatingActionButton,
    this.bottomBar,
    this.titleWidget,
  });
  final String title;
  final Widget child;
  final List<Widget> actions;
  final Widget? floatingActionButton, bottomBar, titleWidget;
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: titleWidget ?? Text(title),
      actions: actions,
      leading: Navigator.of(context).canPop()
          ? BackButton(style: IconButton.styleFrom(iconSize: 20))
          : null,
    ),
    bottomNavigationBar: bottomBar,
    body: SafeArea(
      top: false,
      child: Align(
        alignment: Alignment.topCenter,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 720),
          child: child,
        ),
      ),
    ),
    floatingActionButton: floatingActionButton,
  );
}

class StateMessage extends StatelessWidget {
  const StateMessage({
    super.key,
    this.error,
    this.title = '这里还没有内容',
    this.description = '新的内容发布后，会出现在这里。',
    this.onRetry,
  });
  final Object? error;
  final String title, description;
  final VoidCallback? onRetry;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.all(32),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        CircleAvatar(
          radius: 36,
          backgroundColor: context.colors.brandSubtle,
          child: ReaderIcon(
            error == null ? Icons.inbox_outlined : Icons.cloud_off_outlined,
            size: 32,
            color: context.colors.brand,
          ),
        ),
        const SizedBox(height: 16),
        Text(
          error == null ? title : '暂时无法显示',
          style: context.text.titleLarge,
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 8),
        Text(
          error?.toString() ?? description,
          textAlign: TextAlign.center,
          style: context.text.bodySmall,
        ),
        if (onRetry != null) ...[
          const SizedBox(height: 20),
          OutlinedButton(onPressed: onRetry, child: const Text('重新加载')),
        ],
      ],
    ),
  );
}

class AsyncPane<T> extends ConsumerStatefulWidget {
  const AsyncPane({
    super.key,
    required this.load,
    required this.builder,
    this.loadKey,
  });
  final Future<T> Function() load;
  final Widget Function(T value, Future<void> Function() reload) builder;
  final Object? loadKey;
  @override
  ConsumerState<AsyncPane<T>> createState() => _AsyncPaneState<T>();
}

class _AsyncPaneState<T> extends ConsumerState<AsyncPane<T>>
    with CacheVisibility<AsyncPane<T>> {
  T? value;
  Object? error;
  bool loading = false;
  int serial = 0;
  Set<String> keys = {};
  StreamSubscription<CacheEvent>? changes;
  @override
  void initState() {
    super.initState();
    changes = ref.read(repositoryProvider).cache.events.listen((e) {
      if (!mounted ||
          !cacheVisible ||
          (!keys.contains(e.key) && e.key != '*')) {
        return;
      }
      if (e.kind == 'failed' || e.kind == 'removed') {
        setState(() {
          error = e.error;
          if (e.kind == 'removed' ||
              !ref.read(repositoryProvider).cache.usable(e.key)) {
            value = null;
          }
        });
        return;
      }
      if (e.kind == 'cleared') {
        setState(() => value = null);
        unawaited(load(force: true));
        return;
      }
      if (!loading && e.kind != 'patched') unawaited(load());
    });
    load();
  }

  @override
  void onCacheVisible() {
    if (!loading) load();
  }

  @override
  void didUpdateWidget(covariant AsyncPane<T> old) {
    super.didUpdateWidget(old);
    if (old.loadKey != widget.loadKey) {
      value = null;
      load();
    }
  }

  Future<void> load({bool force = false}) async {
    if (loading && !force) return;
    final ticket = ++serial;
    bool superseded = false;
    setState(() => loading = true);
    final nextKeys = <String>{};
    final repo = ref.read(repositoryProvider);
    try {
      final result = await repo.track(
        nextKeys,
        () => force ? repo.force(widget.load) : widget.load(),
      );
      if (mounted && ticket == serial) {
        setState(() {
          value = result;
          error = null;
          keys = nextKeys;
        });
      }
    } catch (e) {
      superseded = e is CacheSuperseded;
      if (mounted &&
          ticket == serial &&
          e is! SessionChanged &&
          e is! CacheSuperseded) {
        setState(() {
          error = e;
          if (repo.forbidden(e) || nextKeys.any((k) => !repo.cache.usable(k))) {
            value = null;
          }
        });
      }
    } finally {
      if (mounted && ticket == serial) {
        setState(() => loading = false);
        if (superseded && cacheVisible) unawaited(load());
      }
    }
  }

  @override
  void dispose() {
    changes?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (value == null) {
      return error != null
          ? StateMessage(error: error, onRetry: () => load(force: true))
          : const ArticleSkeleton(count: 2);
    }
    final body = widget.builder(value as T, () => load(force: true));
    if (error == null) return body;
    return LayoutBuilder(
      builder: (context, constraints) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: const EdgeInsets.all(8),
            child: Text('更新失败，当前显示上次内容', style: context.text.bodySmall),
          ),
          if (constraints.hasBoundedHeight) Expanded(child: body) else body,
        ],
      ),
    );
  }
}

class SectionTitle extends StatelessWidget {
  const SectionTitle(this.title, {super.key, this.action, this.onTap});
  final String title;
  final String? action;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.fromLTRB(16, 24, 16, 0),
    padding: const EdgeInsets.only(bottom: 12),
    decoration: BoxDecoration(
      border: Border(bottom: BorderSide(color: context.colors.line)),
    ),
    child: Row(
      children: [
        Expanded(
          child: Text(
            title,
            style: TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.w600,
              color: context.colors.textTitle,
            ),
          ),
        ),
        if (action != null)
          InkWell(
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                children: [
                  Text(
                    action!,
                    style: TextStyle(fontSize: 12, color: context.colors.brand),
                  ),
                  PrototypeIcon('chevr', size: 14, color: context.colors.brand),
                ],
              ),
            ),
          ),
      ],
    ),
  );
}

class StatusBadge extends StatelessWidget {
  const StatusBadge(this.status, {super.key});
  final String status;
  @override
  Widget build(BuildContext context) {
    final pending = status == 'pending', draft = status == 'draft';
    final foreground = pending
        ? context.colors.statusPending
        : draft
        ? context.colors.statusDraft
        : context.colors.statusPublished;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: pending
            ? context.colors.statusPendingBg
            : draft
            ? context.colors.statusDraftBg
            : context.colors.statusPublishedBg,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          ReaderIcon(
            pending
                ? Icons.schedule
                : draft
                ? Icons.edit_note
                : Icons.check_circle_outline,
            size: 14,
            color: foreground,
          ),
          const SizedBox(width: 4),
          Text(
            pending
                ? '待审核'
                : draft
                ? '草稿'
                : '已发布',
            style: context.text.labelSmall?.copyWith(color: foreground),
          ),
        ],
      ),
    );
  }
}

class ReaderImage extends ConsumerStatefulWidget {
  const ReaderImage(
    this.url, {
    super.key,
    this.width,
    this.height,
    this.public = false,
  });
  final String url;
  final double? width, height;
  final bool public;
  @override
  ConsumerState<ReaderImage> createState() => _ReaderImageState();
}

class _ReaderImageState extends ConsumerState<ReaderImage> {
  Future<dynamic>? future;
  String? identity;
  @override
  Widget build(BuildContext context) {
    final epoch = ref.watch(sessionProvider.select((s) => s.epoch));
    final repo = ref.read(repositoryProvider);
    final url = repo.api.fileUrl(widget.url);
    final next = '$url:${widget.public}:$epoch';
    if (identity != next) {
      identity = next;
      future = repo.images.load(url, public: widget.public, epoch: epoch);
    }
    return FutureBuilder<dynamic>(
      future: future,
      builder: (context, s) {
        if (s.hasData) {
          return Image.memory(
            s.data,
            width: widget.width,
            height: widget.height,
            fit: BoxFit.cover,
            cacheWidth: widget.width == null
                ? null
                : (widget.width! * MediaQuery.devicePixelRatioOf(context))
                      .ceil(),
            errorBuilder: (c, e, stack) => placeholder(error: true),
          );
        }
        return placeholder(error: s.hasError);
      },
    );
  }

  Widget placeholder({required bool error}) => Container(
    width: widget.width,
    height: widget.height ?? 100,
    color: context.colors.bgSubtle,
    child: Center(
      child: error
          ? IconButton(
              tooltip: '重试图片',
              icon: const ReaderIcon(Icons.broken_image_outlined),
              onPressed: () => setState(() {
                final repo = ref.read(repositoryProvider);
                future = repo.images.load(
                  repo.api.fileUrl(widget.url),
                  public: widget.public,
                  epoch: repo.api.epoch,
                  force: true,
                );
              }),
            )
          : const SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
    ),
  );
}

class ArticleTile extends ConsumerWidget {
  const ArticleTile(
    this.article, {
    super.key,
    this.onTap,
    this.trailing,
    this.showStatus = false,
  });
  final Article article;
  final VoidCallback? onTap;
  final Widget? trailing;
  final bool showStatus;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.watch(reactionRevisionProvider);
    final d = article.data;
    return InkWell(
      onTap: onTap ?? () => context.push('/articles/${article.route}'),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          border: Border(bottom: BorderSide(color: context.colors.line)),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    article.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 16,
                      height: 1.5,
                      fontWeight: FontWeight.w600,
                      color: context.colors.textTitle,
                    ),
                  ),
                  if (d.summary?.isNotEmpty == true) ...[
                    const SizedBox(height: 4),
                    Text(
                      d.summary!,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 12.5,
                        height: 1.65,
                        color: context.colors.textMuted,
                      ),
                    ),
                  ],
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 12,
                    runSpacing: 6,
                    children: [
                      Text(
                        d.categoryName ?? article.author,
                        style: context.text.labelSmall,
                      ),
                      Text(
                        article.progress == null
                            ? '${d.viewCount ?? 0} 阅读'
                            : '已读 ${article.progress!.round()}%',
                        style: context.text.labelSmall,
                      ),
                      if (showStatus) StatusBadge(article.status),
                    ],
                  ),
                  if (article.progress != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 10),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(3),
                        child: LinearProgressIndicator(
                          value: (article.progress! / 100)
                              .clamp(0, 1)
                              .toDouble(),
                          minHeight: 6,
                          backgroundColor: context.colors.line,
                          color: context.colors.brand,
                        ),
                      ),
                    ),
                ],
              ),
            ),
            if (d.coverImage?.isNotEmpty == true &&
                MediaQuery.sizeOf(context).width > 350) ...[
              const SizedBox(width: 12),
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: ReaderImage(
                  d.coverImage!,
                  width: 96,
                  height: 72,
                  public: article.status == 'published',
                ),
              ),
            ],
            ?trailing,
          ],
        ),
      ),
    );
  }
}

class ArticleFeed extends ConsumerStatefulWidget {
  const ArticleFeed({
    super.key,
    this.path = '/articles',
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
  void initState() {
    super.initState();
    controller.addListener(() {
      if (controller.hasClients) savedOffset = controller.offset;
    });
    final repo = repository = ref.read(repositoryProvider);
    snapshotKey = repo.key(
      widget.path,
      widget.query,
      private: widget.path.startsWith('/me/'),
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
    changes = repo.cache.events.listen((e) {
      if (!mounted || !cacheVisible || busy) return;
      if (e.kind == 'patched') {
        setState(() {});
        return;
      }
      if (e.key == '*' || dependencies.contains(e.key)) {
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
    });
    load(check: items.isNotEmpty);
  }

  @override
  void onCacheVisible() {
    if (!busy) load(check: items.isNotEmpty);
  }

  @override
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
    }, private: widget.path.startsWith('/me/'));
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
      setState(() {
        if (check && widget.path.startsWith('/me/')) {
          final differs =
              p.items.map((a) => a.data.json.toString()).join() !=
              items
                  .take(p.items.length)
                  .map((a) => a.data.json.toString())
                  .join();
          if (differs) {
            items = List.of(p.items);
            page = p.page;
            more = p.hasMore;
          }
          pendingUpdate = false;
        } else if (check) {
          pendingUpdate =
              p.items.map((a) => a.data.json.toString()).join() !=
              items
                  .take(p.items.length)
                  .map((a) => a.data.json.toString())
                  .join();
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
      });
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
              padding: const EdgeInsets.all(24),
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

class SubmitButton extends StatelessWidget {
  const SubmitButton({
    super.key,
    required this.label,
    required this.busy,
    required this.onPressed,
  });
  final String label;
  final bool busy;
  final VoidCallback? onPressed;
  @override
  Widget build(BuildContext context) => FilledButton(
    onPressed: busy ? null : onPressed,
    child: busy
        ? Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(
                width: 16,
                height: 16,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
              const SizedBox(width: 8),
              Text(label),
            ],
          )
        : Text(label),
  );
}

class UnreadIcon extends ConsumerStatefulWidget {
  const UnreadIcon(this.icon, {super.key});
  final IconData icon;
  @override
  ConsumerState<UnreadIcon> createState() => _UnreadIconState();
}

class _UnreadIconState extends ConsumerState<UnreadIcon>
    with CacheVisibility<UnreadIcon> {
  StreamSubscription<CacheEvent>? changes;
  @override
  void initState() {
    super.initState();
    changes = ref.read(repositoryProvider).cache.events.listen((e) {
      if (mounted &&
          cacheVisible &&
          (e.key == '*' || e.key.contains('/me/notifications/unread-count')) &&
          e.kind != 'failed' &&
          e.kind != 'patched') {
        ref.invalidate(unreadCountProvider);
      }
    });
  }

  @override
  void onCacheVisible() {
    ref.invalidate(unreadCountProvider);
  }

  @override
  void dispose() {
    changes?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final count = ref.watch(unreadCountProvider).asData?.value ?? 0;
    return Badge(
      isLabelVisible: count > 0,
      label: Text(count > 99 ? '99+' : '$count'),
      child: ReaderIcon(widget.icon),
    );
  }
}

class PageIntro extends StatelessWidget {
  const PageIntro(this.title, this.subtitle, {super.key});
  final String title, subtitle;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(16, 20, 16, 8),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: TextStyle(
            fontSize: 24,
            height: 1.35,
            fontWeight: FontWeight.w700,
            color: context.colors.textTitle,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          subtitle,
          style: TextStyle(
            fontSize: 12.5,
            height: 1.65,
            color: context.colors.textMuted,
          ),
        ),
      ],
    ),
  );
}

class ArticleSkeleton extends StatelessWidget {
  const ArticleSkeleton({super.key, this.count = 3});
  final int count;
  @override
  Widget build(BuildContext context) => Column(
    children: [
      for (var i = 0; i < count; i++)
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            border: Border(bottom: BorderSide(color: context.colors.line)),
          ),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    for (final width in [.82, 1.0, .45])
                      Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: FractionallySizedBox(
                          widthFactor: width,
                          child: Container(
                            height: 14,
                            decoration: BoxDecoration(
                              color: context.colors.skeleton,
                              borderRadius: BorderRadius.circular(4),
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Container(
                width: 96,
                height: 72,
                decoration: BoxDecoration(
                  color: context.colors.skeleton,
                  borderRadius: BorderRadius.circular(4),
                ),
              ),
            ],
          ),
        ),
    ],
  );
}

class CellGroup extends StatelessWidget {
  const CellGroup({super.key, required this.children});
  final List<Widget> children;
  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
    clipBehavior: Clip.antiAlias,
    decoration: BoxDecoration(
      color: context.colors.surface,
      border: Border.all(color: context.colors.line),
      borderRadius: BorderRadius.circular(8),
    ),
    child: Column(
      children: [
        for (var i = 0; i < children.length; i++) ...[
          if (i > 0) const Divider(),
          children[i],
        ],
      ],
    ),
  );
}

class MenuCell extends StatelessWidget {
  const MenuCell(
    this.title,
    this.icon, {
    super.key,
    this.subtitle,
    this.onTap,
    this.trailing,
    this.danger = false,
  });
  final String title, icon;
  final String? subtitle;
  final VoidCallback? onTap;
  final Widget? trailing;
  final bool danger;
  @override
  Widget build(BuildContext context) => InkWell(
    onTap: onTap,
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          PrototypeIcon(
            icon,
            size: 20,
            color: danger ? context.colors.danger : context.colors.brand,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontSize: 14.5,
                    color: danger
                        ? context.colors.danger
                        : context.colors.textBody,
                  ),
                ),
                if (subtitle != null)
                  Text(
                    subtitle!,
                    style: TextStyle(
                      fontSize: 11.5,
                      height: 1.6,
                      color: context.colors.textMuted,
                    ),
                  ),
              ],
            ),
          ),
          trailing ??
              PrototypeIcon('chevr', size: 15, color: context.colors.textMuted),
        ],
      ),
    ),
  );
}
