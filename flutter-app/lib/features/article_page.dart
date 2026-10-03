import '../core/cache/cache_key.dart';

import 'package:fullstack_reader/core/network/endpoints.dart';

import '../app/theme/app_theme.dart';
import '../shared/prototype_icons.dart';

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';

import '../app/session.dart';
import '../core/generated/models.dart';
import '../core/markdown/reader_markdown.dart';

import 'package:fullstack_reader/shared/widgets/menu_cell.dart';
import 'package:fullstack_reader/shared/widgets/notice.dart';
import 'package:fullstack_reader/shared/widgets/page_frame.dart';
import 'package:fullstack_reader/shared/widgets/reader_context.dart';
import 'package:fullstack_reader/shared/widgets/state_message.dart';
import 'package:fullstack_reader/shared/widgets/status_badge.dart';

import '../shared/cache_visibility.dart';
import '../core/cache/data_cache.dart';
import '../core/network/api_client.dart';
import 'comments.dart';

import 'package:fullstack_reader/features/data/reader_models.dart';

part 'article/article_comment_bar.dart';
part 'article/article_breadcrumb.dart';
part 'article/article_category.dart';
part 'article/article_title.dart';
part 'article/author_bar.dart';
part 'article/article_summary.dart';
part 'article/article_tags.dart';
part 'article/adjacent_article.dart';
part 'article/article_action.dart';
part 'article/article_navigation.dart';
part 'article/article_reactions.dart';
part 'article/article_content.dart';

/// 公开阅读与本人稿件预览共享布局，预览不记录浏览也不复用公开正文缓存。
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
    cacheChanges = repo.cache.events.listen(onCacheEvent);
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

  /// 仅可见页面响应缓存事件；失效和请求失败分别处理，避免重复重载。
  void onCacheEvent(CacheEvent e) {
    final repo = ref.read(repositoryProvider);
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
      setState(() {
        article = null;
        error = e.error;
      });
      return;
    }
    if (e.kind == 'failed') {
      if (e.key.contains(CacheKeys.articlePrefix) &&
          !repo.cache.usable(e.key)) {
        setState(() {
          article = null;
          error = e.error;
        });
      } else {
        notice(context, '更新失败，当前显示上次内容');
      }
      return;
    }
    if (e.kind == 'cleared') {
      setState(() => article = null);
    }
    if (e.kind != 'patched') load();
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
            Endpoints.meHistory,
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
      await repo.track(
        dependencies,
        () => force ? repo.force(readArticle) : readArticle(),
      );
    } catch (e) {
      superseded = e is CacheSuperseded;
      if (mounted && e is! SessionChanged && e is! CacheSuperseded) {
        if (repo.forbidden(e) || article == null) {
          setState(() => showLoadError(e));
        } else {
          notice(context, e);
        }
      }
    } finally {
      loading = false;
      if (superseded && mounted && cacheVisible) unawaited(load());
    }
  }

  void showLoadError(Object failure) {
    article = null;
    error = failure;
  }

  Future<void> readArticle() async {
    final repo = ref.read(repositoryProvider);
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
          repo.reactions[a.id]?['likeCount'] as int? ?? a.data.likeCount ?? 0;
      toc = nextToc;
      if (!same || keys.isEmpty) {
        keys = {
          for (final t in toc) t.anchor!: GlobalKey(debugLabel: t.anchor),
        };
      }
    });
    final next = await repo.read(Endpoints.adjacent(a.id));
    if (mounted) setState(() => adjacent = jsonMap(next));
    await loadInteractions();
    if (!recorded) {
      recorded = true;
      await repo.api.request(Endpoints.view(a.id), method: 'POST');
      if (ref.read(sessionProvider).user != null) {
        await repo.api.request(
          Endpoints.meHistory,
          method: 'POST',
          data: {'articleId': a.id, 'progress': 0},
        );
      }
    }
  }

  Future<void> loadInteractions() async {
    final repo = ref.read(repositoryProvider);
    final data = await repo.read(Endpoints.likeStatus(article!.id));
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

  Future<bool> requireMember() async {
    if (ref.read(sessionProvider).user != null) return true;
    await context.push(
      '/login?from=${Uri.encodeComponent('/articles/${widget.id}')}',
    );
    if (mounted) await loadInteractions();
    return false;
  }

  /// 点赞立即更新所有已缓存摘要；服务端失败才恢复原值。
  Future<void> toggleLike() async {
    if (!await requireMember() || !mounted || likeBusy) return;
    final before = liked, beforeCount = likes;
    final repo = ref.read(repositoryProvider);
    setState(() {
      likeBusy = true;
      liked = !before;
      likes = (likes + (liked ? 1 : -1)).clamp(0, 1 << 53);
    });
    repo.setReaction(article!.id, liked: liked, count: likes);
    try {
      final result = jsonMap(
        await repo.api.request(
          Endpoints.like(article!.id),
          method: before ? 'DELETE' : 'POST',
        ),
      );
      if (!mounted) return;
      setState(() {
        liked = result['liked'] as bool? ?? !before;
        likes = (result['likeCount'] as num?)?.toInt() ?? likes;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        liked = before;
        likes = beforeCount;
      });
      repo.setReaction(article!.id, liked: before, count: beforeCount);
      notice(context, e);
    } finally {
      if (mounted) setState(() => likeBusy = false);
    }
  }

  /// 收藏与点赞互不阻塞；回滚同步修复收藏索引的短期覆盖值。
  Future<void> toggleFavorite() async {
    if (!await requireMember() || !mounted || favoriteBusy) return;
    final before = favorite;
    final repo = ref.read(repositoryProvider);
    setState(() {
      favoriteBusy = true;
      favorite = !before;
    });
    repo.setReaction(article!.id, favorite: favorite);
    try {
      await repo.api.request(
        before ? Endpoints.favorite(article!.id) : Endpoints.meFavorites,
        method: before ? 'DELETE' : 'POST',
        data: before ? null : {'articleId': article!.id},
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => favorite = before);
      repo.setReaction(article!.id, favorite: before);
      notice(context, e);
    } finally {
      if (mounted) setState(() => favoriteBusy = false);
    }
  }

  final commentKey = GlobalKey();
  _ArticleNavigation get navigation =>
      _ArticleNavigation(context, article, toc, keys);
  void openComment() => navigation.openComment(commentKey);

  Widget reactionPanel() => _ArticleReactions(
    likes: likes,
    liked: liked,
    favorite: favorite,
    likeBusy: likeBusy,
    favoriteBusy: favoriteBusy,
    interactionReady: interactionReady,
    like: toggleLike,
    bookmark: toggleFavorite,
    shareArticle: navigation.shareArticle,
    loadInteractions: loadInteractions,
  );

  @override
  Widget build(BuildContext context) {
    final a = article;
    return PageFrame(
      title: widget.preview ? '投稿预览' : '文章',
      bottomBar: widget.preview
          ? null
          : _ArticleCommentBar(openComment: openComment),
      actions: navigation.toolbarActions(
        preview: widget.preview,
        refresh: () => load(force: true),
      ),
      child: a == null
          ? (error != null
                ? StateMessage(error: error, onRetry: load)
                : const Center(child: CircularProgressIndicator()))
          : _ArticleContent(
              a: a,
              preview: widget.preview,
              scroll: scroll,
              likes: likes,
              toc: toc,
              keys: keys,
              reactions: reactionPanel(),
              adjacent: adjacent,
              commentKey: commentKey,
              epoch: ref.watch(sessionProvider).epoch,
            ),
    );
  }
}
