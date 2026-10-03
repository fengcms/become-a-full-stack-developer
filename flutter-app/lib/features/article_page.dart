import '../shared/prototype_icons.dart';

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';

import '../app/session.dart';
import '../core/generated/models.dart';
import '../core/markdown/reader_markdown.dart';
import '../shared/widgets.dart';
import '../shared/cache_visibility.dart';
import '../core/cache/data_cache.dart';
import '../core/network/api_client.dart';
import 'comments.dart';
import 'repository.dart';

class ArticlePage extends ConsumerStatefulWidget {
  const ArticlePage(this.id, {super.key, this.preview = false});
  final String id;
  final bool preview;
  @override
  ConsumerState<ArticlePage> createState() => _ArticlePageState();
}

class _ArticlePageState extends ConsumerState<ArticlePage>
    with CacheVisibility<ArticlePage> {
  StreamSubscription<CacheEvent>? cacheChanges;
  StreamSubscription<int>? reactionChanges;
  final dependencies = <String>{};
  bool loading = false, recorded = false;
  @override
  void onCacheVisible() {
    if (!widget.preview && !loading) load();
  }

  Article? article;
  Object? error;
  List<ApiTocItem> toc = [];
  Map<String, dynamic> adjacent = {};
  Map<String, GlobalKey> keys = {};
  bool liked = false,
      favorite = false,
      likeBusy = false,
      favoriteBusy = false,
      interactionReady = false;
  int likes = 0;
  final scroll = ScrollController();
  Timer? historyTimer;
  @override
  void initState() {
    super.initState();
    final repo = ref.read(repositoryProvider);
    cacheChanges = repo.cache.events.listen((e) {
      if (!mounted ||
          !cacheVisible ||
          widget.preview ||
          loading ||
          likeBusy ||
          favoriteBusy) {
        return;
      }
      if (e.key != '*' && !dependencies.contains(e.key)) return;
      if (e.kind == 'removed') {
        setState(() {article = null; error = e.error;});
        return;
      }
      if (e.kind == 'failed') {
        if (e.key.contains('/reader/article/') && !repo.cache.usable(e.key)) {
          setState(() {article = null; error = e.error;});
        } else {
          notice(context, '更新失败，当前显示上次内容');
        }
        return;
      }
      if (e.kind == 'cleared') {
        setState(() => article = null);
      }
      if (e.kind != 'patched') load();
    });
    reactionChanges = repo.reactionEvents.listen((id) {
      if (!mounted || article?.id != id) return;
      final r = repo.reactions[id]!;
      setState(() {
        liked = r['liked'] as bool? ?? liked;
        favorite = r['favorite'] as bool? ?? favorite;
        likes = r['likeCount'] as int? ?? likes;
      });
    });
    load();
    scroll.addListener(trackProgress);
  }

  @override
  void dispose() {
    historyTimer?.cancel();
    cacheChanges?.cancel();
    reactionChanges?.cancel();
    scroll.dispose();
    super.dispose();
  }

  void trackProgress() {
    if (widget.preview ||
        article == null ||
        ref.read(sessionProvider).user == null) {
      return;
    }
    historyTimer?.cancel();
    historyTimer = Timer(const Duration(seconds: 2), () {
      if (!mounted || !scroll.hasClients) return;
      final progress = scroll.position.maxScrollExtent == 0
          ? 100
          : (scroll.offset / scroll.position.maxScrollExtent * 100)
                .round()
                .clamp(0, 100);
      ref
          .read(sessionProvider)
          .api
          .request(
            '/me/history',
            method: 'POST',
            data: {'articleId': article!.id, 'progress': progress},
          )
          .catchError((Object e) {
            return null;
          });
    });
  }

  Future<void> load({bool force = false}) async {
    if (loading) return;
    loading = true;
    bool superseded = false;
    if (mounted) setState(() => error = null);
    final repo = ref.read(repositoryProvider);
    try {
      await repo.track(dependencies, () async {
        Future<void> read() async {
          if (widget.preview) {
            final a = await repo.article(widget.id, private: true);
            if (mounted) {
              setState(() {
                article = a;
                likes = a.data.likeCount ?? 0;
              });
            }
            return;
          }
          final b = await repo.bundle(widget.id);
          final a = Article.fromJson(jsonMap(b['article']));
          final nextToc = (b['toc'] as List)
              .map((j) => ApiTocItem.fromJson(jsonMap(j)))
              .toList();
          if (!mounted) return;
          setState(() {
            final same = article?.content == a.content;
            article = a;
            likes =
                repo.reactions[a.id]?['likeCount'] as int? ??
                a.data.likeCount ??
                0;
            toc = nextToc;
            if (!same || keys.isEmpty) {
              keys = {
                for (final t in toc) t.anchor!: GlobalKey(debugLabel: t.anchor),
              };
            }
          });
          final next = await repo.read('/articles/${a.id}/adjacent');
          if (mounted) setState(() => adjacent = jsonMap(next));
          await loadInteractions();
          if (!recorded) {
            recorded = true;
            await repo.api.request('/articles/${a.id}/view', method: 'POST');
            if (ref.read(sessionProvider).user != null) {
              await repo.api.request(
                '/me/history',
                method: 'POST',
                data: {'articleId': a.id, 'progress': 0},
              );
            }
          }
        }

        if (force) {
          await repo.force(read);
        } else {
          await read();
        }
      });
    } catch (e) {
      superseded = e is CacheSuperseded;
      if (mounted && e is! SessionChanged && e is! CacheSuperseded) {
        if (repo.forbidden(e) || article == null) {
          setState(() {
            article = null;
            error = e;
          });
        } else {
          notice(context, e);
        }
      }
    } finally {
      loading = false;
      if (superseded && mounted && cacheVisible) unawaited(load());
    }
  }

  Future<void> loadInteractions() async {
    final repo = ref.read(repositoryProvider);
    final data = await repo.read('/articles/${article!.id}/like/status');
    final found = ref.read(sessionProvider).user != null
        ? await repo.favorite(article!.id)
        : false;
    if (mounted) {
      setState(() {
        liked = data['liked'] == true;
        likes =
            (data['likeCount'] as num?)?.toInt() ??
            article!.data.likeCount ??
            0;
        favorite = found;
        interactionReady = true;
      });
      repo.setReaction(
        article!.id,
        liked: liked,
        count: likes,
        favorite: favorite,
        local: false,
      );
    }
  }

  Future<void> toggle(bool like) async {
    if (ref.read(sessionProvider).user == null) {
      await context.push(
        '/login?from=${Uri.encodeComponent('/articles/${widget.id}')}',
      );
      if (mounted) loadInteractions();
      return;
    }
    if (like ? likeBusy : favoriteBusy) return;
    final before = like ? liked : favorite;
    final beforeCount = likes;
    setState(() {
      if (like) {
        likeBusy = true;
        liked = !before;
        likes = (likes + (liked ? 1 : -1)).clamp(0, 1 << 53);
      } else {
        favoriteBusy = true;
        favorite = !before;
      }
    });
    ref
        .read(repositoryProvider)
        .setReaction(
          article!.id,
          liked: like ? liked : null,
          count: like ? likes : null,
          favorite: like ? null : favorite,
        );
    try {
      final api = ref.read(sessionProvider).api;
      if (like) {
        final result = jsonMap(
          await api.request(
            '/articles/${article!.id}/like',
            method: before ? 'DELETE' : 'POST',
          ),
        );
        if (!mounted) return;
        setState(() {
          liked = result['liked'] as bool? ?? !before;
          likes = (result['likeCount'] as num?)?.toInt() ?? likes;
        });
      } else {
        await api.request(
          before ? '/me/favorites/${article!.id}' : '/me/favorites',
          method: before ? 'DELETE' : 'POST',
          data: before ? null : {'articleId': article!.id},
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          if (like) {
            liked = before;
            likes = beforeCount;
          } else {
            favorite = before;
          }
        });
        ref
            .read(repositoryProvider)
            .setReaction(
              article!.id,
              liked: like ? before : null,
              count: like ? beforeCount : null,
              favorite: like ? null : before,
            );
        notice(context, e);
      }
    } finally {
      if (mounted) {
        setState(() {
          if (like) {
            likeBusy = false;
          } else {
            favoriteBusy = false;
          }
        });
      }
    }
  }

  Future<void> directory() async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (c) => SafeArea(
        child: SizedBox(
          height: MediaQuery.sizeOf(c).height * .6,
          child: Column(
            children: [
              Text('文章目录', style: c.text.titleLarge),
              Expanded(
                child: ListView(
                  children: [
                    for (final t in toc)
                      ListTile(
                        contentPadding: EdgeInsets.only(
                          left: 16 + ((t.level ?? 1) - 1) * 12.0,
                          right: 16,
                        ),
                        title: Text(t.text ?? ''),
                        enabled: keys[t.anchor]?.currentContext != null,
                        onTap: () {
                          Navigator.pop(c);
                          final target = keys[t.anchor]?.currentContext;
                          if (target != null) {
                            Scrollable.ensureVisible(
                              target,
                              duration: MediaQuery.disableAnimationsOf(context)
                                  ? Duration.zero
                                  : const Duration(milliseconds: 250),
                              alignment: .05,
                            );
                          }
                        },
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

  final commentKey = GlobalKey();
  Future<void> shareArticle() async {
    if (article == null) return;
    try {
      const site = String.fromEnvironment('SITE_URL', defaultValue: '');
      await SharePlus.instance.share(
        ShareParams(
          text: site.isEmpty
              ? '${article!.title}\n${article!.data.summary ?? ""}'
              : '${article!.title}\n$site/articles/${article!.route}',
        ),
      );
    } catch (e) {
      if (mounted) notice(context, '分享未完成');
    }
  }

  Future<void> moreActions() => showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    builder: (c) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('文章操作', style: context.text.titleMedium),
          MenuCell(
            '分享文章',
            'share',
            onTap: () {
              Navigator.pop(c);
              shareArticle();
            },
          ),
          MenuCell(
            '作者主页',
            'user',
            onTap: () {
              Navigator.pop(c);
              context.push('/members/${article?.data.authorId}');
            },
          ),
        ],
      ),
    ),
  );
  void openComment() {
    final target = commentKey.currentContext;
    if (target != null) {
      Scrollable.ensureVisible(
        target,
        duration: const Duration(milliseconds: 250),
        alignment: 1,
      );
    }
  }

  Widget action(
    String icon,
    String label,
    VoidCallback? tap, {
    bool active = false,
  }) => InkWell(
    onTap: tap,
    child: Container(
      constraints: const BoxConstraints(minWidth: 72, minHeight: 56),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: active ? context.colors.brandSubtle : context.colors.surface,
        border: Border.all(
          color: active ? context.colors.brand : context.colors.line,
        ),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        children: [
          PrototypeIcon(
            icon,
            size: 19,
            color: active ? context.colors.brand : context.colors.textMuted,
          ),
          const SizedBox(height: 5),
          Text(
            label,
            style: TextStyle(
              fontSize: 11,
              color: active ? context.colors.brand : context.colors.textMuted,
            ),
          ),
        ],
      ),
    ),
  );
  @override
  Widget build(BuildContext context) {
    final a = article;
    return PageFrame(
      title: widget.preview ? '投稿预览' : '文章',
      bottomBar: widget.preview
          ? null
          : SafeArea(
              top: false,
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 8,
                ),
                decoration: BoxDecoration(
                  color: context.colors.surface,
                  border: Border(top: BorderSide(color: context.colors.line)),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: InkWell(
                        onTap: openComment,
                        child: Container(
                          height: 38,
                          padding: const EdgeInsets.symmetric(horizontal: 16),
                          alignment: Alignment.centerLeft,
                          decoration: BoxDecoration(
                            color: context.colors.bgSubtle,
                            border: Border.all(
                              color: context.colors.fieldBorder,
                            ),
                            borderRadius: BorderRadius.circular(99),
                          ),
                          child: Text(
                            '写下你的评论…',
                            style: TextStyle(
                              fontSize: 13,
                              color: context.colors.textPlaceholder,
                            ),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    IconButton(
                      tooltip: '发表评论',
                      onPressed: openComment,
                      style: IconButton.styleFrom(
                        backgroundColor: context.colors.brandSolid,
                        foregroundColor: Colors.white,
                      ),
                      icon: const PrototypeIcon('send', size: 17),
                    ),
                  ],
                ),
              ),
            ),
      actions: [
        if (!widget.preview)
          IconButton(
            tooltip: '刷新文章',
            onPressed: () => load(force: true),
            icon: const PrototypeIcon('refresh', size: 20),
          ),
        if (!widget.preview && toc.isNotEmpty)
          IconButton(
            tooltip: '目录',
            onPressed: directory,
            icon: const ReaderIcon(Icons.format_list_bulleted),
          ),
        if (a != null && !widget.preview)
          IconButton(
            tooltip: '更多',
            onPressed: moreActions,
            icon: const PrototypeIcon('more'),
          ),
      ],
      child: a == null
          ? (error != null
                ? StateMessage(error: error, onRetry: load)
                : const Center(child: CircularProgressIndicator()))
          : SingleChildScrollView(
              controller: scroll,
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (widget.preview)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Row(
                        children: [
                          StatusBadge(a.status),
                          const SizedBox(width: 12),
                          const Text('仅本人可见的稿件预览'),
                        ],
                      ),
                    ),
                  if (!widget.preview) ...[
                    Row(
                      children: [
                        InkWell(
                          onTap: () => context.go('/'),
                          child: Text('首页', style: context.text.labelSmall),
                        ),
                        const Padding(
                          padding: EdgeInsets.symmetric(horizontal: 6),
                          child: PrototypeIcon('chevr', size: 13),
                        ),
                        Text(
                          a.data.categoryName ?? '文章',
                          style: context.text.labelSmall,
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    Align(
                      alignment: Alignment.centerLeft,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 3,
                        ),
                        decoration: BoxDecoration(
                          color: context.colors.brandSubtle,
                          borderRadius: BorderRadius.circular(99),
                        ),
                        child: Text(
                          a.data.categoryName ?? '文章',
                          style: TextStyle(
                            fontSize: 11,
                            color: context.colors.brandOnSubtle,
                          ),
                        ),
                      ),
                    ),
                  ],
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    child: Text(
                      a.title,
                      style: TextStyle(
                        fontSize: 24,
                        height: 1.4,
                        fontWeight: FontWeight.w700,
                        color: context.colors.textTitle,
                      ),
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.only(bottom: 16),
                    margin: const EdgeInsets.only(bottom: 16),
                    decoration: BoxDecoration(
                      border: Border(
                        bottom: BorderSide(color: context.colors.line),
                      ),
                    ),
                    child: InkWell(
                      onTap: () => context.push('/members/${a.data.authorId}'),
                      child: Row(
                        children: [
                          CircleAvatar(
                            radius: 18,
                            backgroundColor: context.colors.brandSubtle,
                            foregroundColor: context.colors.brandOnSubtle,
                            child: Text(a.author.characters.first),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  a.author,
                                  style: const TextStyle(
                                    fontSize: 14,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                                Text(
                                  '${a.data.publishedAt?.split('T').first ?? ''} · ${a.data.viewCount ?? 0} 阅读 · $likes 赞',
                                  style: context.text.labelSmall,
                                ),
                              ],
                            ),
                          ),
                          const PrototypeIcon('more'),
                        ],
                      ),
                    ),
                  ),
                  if (a.data.summary?.isNotEmpty == true)
                    Container(
                      padding: const EdgeInsets.all(16),
                      margin: const EdgeInsets.only(bottom: 20),
                      decoration: BoxDecoration(
                        color: context.colors.surfaceSunken,
                        border: Border(
                          left: BorderSide(
                            color: context.colors.brandSubtle,
                            width: 3,
                          ),
                        ),
                        borderRadius: const BorderRadius.horizontal(
                          right: Radius.circular(6),
                        ),
                      ),
                      child: Text(
                        a.data.summary!,
                        style: TextStyle(
                          fontSize: 14,
                          height: 1.8,
                          color: context.colors.textMuted,
                        ),
                      ),
                    ),
                  ReaderMarkdown(
                    a.content,
                    publicImages: !widget.preview,
                    toc: widget.preview ? const [] : toc,
                    headingKeys: keys,
                  ),
                  const SizedBox(height: 24),
                  Wrap(
                    spacing: 8,
                    children: [
                      for (final tag in a.data.tags)
                        ActionChip(
                          label: Text(tag),
                          onPressed: () => context.push(
                            '/browse?tag=${Uri.encodeComponent(tag)}&title=${Uri.encodeComponent(tag)}',
                          ),
                        ),
                    ],
                  ),
                  if (!widget.preview && a.status == 'published') ...[
                    Container(
                      key: const ValueKey('article-actions'),
                      margin: const EdgeInsets.only(top: 16),
                      padding: const EdgeInsets.symmetric(vertical: 20),
                      decoration: BoxDecoration(
                        border: Border(
                          top: BorderSide(color: context.colors.line),
                          bottom: BorderSide(color: context.colors.line),
                        ),
                      ),
                      child: Wrap(
                        alignment: WrapAlignment.center,
                        spacing: 12,
                        runSpacing: 12,
                        children: [
                          action(
                            'heart',
                            '点赞 $likes',
                            (likeBusy || !interactionReady)
                                ? null
                                : () => toggle(true),
                            active: liked,
                          ),
                          action(
                            'bookmark',
                            favorite ? '已收藏' : '收藏',
                            (favoriteBusy || !interactionReady)
                                ? null
                                : () => toggle(false),
                            active: favorite,
                          ),
                          action('share', '分享', shareArticle),
                          if (!interactionReady)
                            TextButton(
                              onPressed: () async {
                                try {
                                  await loadInteractions();
                                } catch (e) {
                                  if (context.mounted) notice(context, e);
                                }
                              },
                              child: const Text('刷新互动状态'),
                            ),
                        ],
                      ),
                    ),
                    for (final entry in adjacent.entries)
                      if (entry.value is Map)
                        Container(
                          margin: const EdgeInsets.only(top: 8),
                          decoration: BoxDecoration(
                            border: Border.all(color: context.colors.line),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: ListTile(
                            subtitle: Text(
                              entry.value['title'],
                              style: TextStyle(
                                fontSize: 13.5,
                                height: 1.55,
                                color: context.colors.textBody,
                              ),
                            ),
                            title: Text(
                              entry.key == 'prev' ? '上一篇' : '下一篇',
                              style: context.text.labelSmall,
                            ),
                            trailing: const ReaderIcon(Icons.chevron_right),
                            onTap: () => context.push(
                              '/articles/${entry.value['slug'] ?? entry.value['id']}',
                            ),
                          ),
                        ),
                    Comments(
                      a.id,
                      composerKey: commentKey,
                      key: ValueKey(
                        '${a.id}-${ref.watch(sessionProvider).epoch}',
                      ),
                    ),
                  ],
                  const SizedBox(height: 24),
                ],
              ),
            ),
    );
  }
}
