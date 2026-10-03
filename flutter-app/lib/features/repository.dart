import 'data/fetch_cache_reply.dart';
import '../core/cache/cache_key.dart';
import '../core/cache/cache_limits.dart';

import 'package:fullstack_reader/core/network/endpoints.dart';

export 'data/reader_models.dart';
import 'data/reader_models.dart';
import 'data/cache_policy_table.dart';
import 'data/favorite_index.dart';
import 'data/article_reader.dart';
import 'data/reaction_store.dart';
import 'data/member_overview.dart';

import 'dart:async';

import '../core/cache/data_cache.dart';
import '../core/cache/image_store.dart';
import '../core/markdown/code_cache.dart';
import '../core/generated/models.dart';
import '../core/network/api_client.dart';

/// 组合缓存策略与资源服务，页面通过此入口读取数据并同步写操作影响。
class ReaderRepository {
  ReaderRepository(this.api, {DataCache? cache})
    : cache = cache ?? DataCache() {
    api.onMutation = _mutation;
    api.onSessionChanged = resetPrivate;
    this.cache.events.listen((e) {
      if (e.kind == 'removed' && e.key.contains(CacheKeys.articlePrefix)) {
        articleReader.aliases.clear();
        this.cache.invalidate({'articleLists'});
      }
    });
  }
  late final favoriteIndex = FavoriteIndex(
    loadPage: (page) => articles(path: Endpoints.meFavorites, page: page),
    savedAt: (page) => cache.savedAt(
      key(Endpoints.meFavorites, {'page': page, 'pageSize': 12}, private: true),
    ),
  );
  Future<bool> favorite(int id) => favoriteIndex.contains(id, forced: forced);
  late final memberOverview = MemberOverview(
    cache: cache,
    key: key,
    read: (path, {query = const {}}) => read(path, query: query),
    trackKey: _trackKey,
    forbidden: forbidden,
  );
  Future<Map<String, dynamic>> overview() =>
      memberOverview.load(forced: forced);
  final policies = CachePolicyTable();
  CachePolicy? policy(String path) => policies.policy(path);
  Set<String> resourceTags(String path) => policies.resourceTags(path);
  final ApiClient api;
  final DataCache cache;
  late final ImageStore images = ImageStore(api.dio, namespace: api.baseUrl);
  late final articleReader = ArticleReader(
    cache: cache,
    baseUrl: api.baseUrl,
    key: (path, query) => key(path, query),
    fetch: (path, {anonymous = false}) => fetch(path, anonymous: anonymous),
    trackKey: _trackKey,
    forbidden: forbidden,
  );
  void _trackKey(String key) =>
      (Zone.current[_tracking] as Set<String>?)?.add(key);
  Future<Map<String, dynamic>> bundle(String id, {bool force = false}) =>
      articleReader.read(id, force: force || forced);
  late final reactionStore = ReactionStore(
    cache: cache,
    key: key,
    policy: policy,
    resourceTags: resourceTags,
    favoriteOverrides: favoriteIndex.overrides,
  );
  Map<int, Map<String, dynamic>> get reactions => reactionStore.reactions;
  Stream<int> get reactionEvents => reactionStore.events.stream;
  void setReaction(
    int id, {
    bool? liked,
    int? count,
    bool? favorite,
    bool local = true,
  }) => reactionStore.set(
    id,
    liked: liked,
    count: count,
    favorite: favorite,
    local: local,
  );
  final snapshots = <String, FeedSnapshot>{};
  static final _force = Object(), _tracking = Object();
  // Zone 将主动刷新意图传递给组合读取，避免每一层手工传参漏掉子请求。
  Future<T> force<T>(Future<T> Function() task) =>
      runZoned(task, zoneValues: {_force: true});
  // 记录页面实际读取的缓存键；后台事件仅唤醒依赖这些键的页面。
  Future<T> track<T>(Set<String> keys, Future<T> Function() task) =>
      runZoned(task, zoneValues: {_tracking: keys});
  bool get forced => Zone.current[_force] == true;

  // 公共与私有身份由类型化键统一编码，查询排序交给 CacheKey 处理。
  String key(String path, Map<String, dynamic> query, {bool private = false}) {
    return CacheKey(
      api.baseUrl,
      private ? 'session:${api.userId}:${api.epoch}' : 'public',
      path,
      query,
    ).encode();
  }

  String feedTag(String path, Map<String, dynamic> query) =>
      'feed:${key(path, {'pageSize': 12, ...query}..remove('page'), private: path.startsWith(Endpoints.privatePrefix))}';

  bool forbidden(Object e) =>
      e is ApiFailure &&
      ([401, 403, 404].contains(e.status) ||
          [1003, 1004, 1005, 2001, 3001].contains(e.code));
  Future<CacheReply> fetch(
    String path, {
    Map<String, dynamic> query = const {},
    bool anonymous = false,
  }) => fetchCacheReply(api, path, query: query, anonymous: anonymous);

  // 先查显式白名单；未列入策略的端点保留原始联网行为。
  Future<dynamic> read(
    String path, {
    Map<String, dynamic> query = const {},
    bool force = false,
  }) {
    var p = policy(path);
    if (p == null) return api.request(path, query: query);
    p = policies.forQuery(path, query, p);
    final private =
        path.startsWith(Endpoints.privatePrefix) ||
        path.endsWith(Endpoints.likeStatusSuffix);
    final k = key(path, query, private: private);
    (Zone.current[_tracking] as Set<String>?)?.add(k);
    return cache.get(
      k,
      p,
      () async {
        final result = await fetch(path, query: query, anonymous: !private);
        policies.validate(path, result.value);
        return result;
      },
      force: force || forced,
      tags: {
        ...resourceTags(path),
        if (query.containsKey('page')) feedTag(path, query),
      },
      forbidden: forbidden,
    );
  }

  // 本人预览走鉴权请求并绕过公开正文缓存。
  Future<Article> article(String id, {bool private = false}) async =>
      Article.fromJson(
        private
            ? jsonMap(await api.request(Endpoints.article(id)))
            : jsonMap((await bundle(id))['article']),
      );
  Future<List<ApiTocItem>> toc(int id) async =>
      ((await bundle('$id'))['toc'] as List)
          .map((j) => ApiTocItem.fromJson(jsonMap(j)))
          .toList();

  // 兼容分页对象和点赞裸数组两种协议，历史条目额外携带阅读进度。
  Future<PageResult<Article>> articles({
    int page = 1,
    String path = Endpoints.articles,
    Map<String, dynamic> query = const {},
    bool force = false,
  }) async {
    var data = await read(
      path,
      query: {'page': page, 'pageSize': 12, ...query},
      force: force,
    );
    if (path == Endpoints.search) data = data['articles'];
    if (data is List) {
      final list = data.map((j) => Article.fromJson(jsonMap(j))).toList();
      final size = query['pageSize'] as int? ?? 12;
      return PageResult(list, page, list.length == size ? page + 1 : page, 0);
    }
    return PageResult.fromJson(
      data,
      (j) => Article.fromJson(
        j['article'] is Map ? jsonMap(j['article']) : j,
        progress: j['progress'] as num?,
      ),
    );
  }

  Future<List<ApiCategoryNode>> categories() async =>
      (await read(Endpoints.categoriesTree) as List)
          .map((j) => ApiCategoryNode.fromJson(jsonMap(j)))
          .toList();
  Future<List<ApiTag>> tags() async => (await read(Endpoints.tags) as List)
      .map((j) => ApiTag.fromJson(jsonMap(j)))
      .toList();
  Future<PageResult<ApiComment>> comments(
    int id,
    int page, {
    bool force = false,
  }) async => PageResult.fromJson(
    await read(
      Endpoints.comments(id),
      query: {'page': page, 'pageSize': 20, 'sort': 'createdAt'},
      force: force,
    ),
    ApiComment.fromJson,
  );

  // 写操作失败也会使相关读取失效，因为请求可能已被服务器接收。
  void _mutation(
    String path,
    String method,
    Object? data,
    bool started,
    dynamic result,
    Object? error,
  ) {
    final affected = policies.mutationTags(path, data);
    if (started) {
      cache.fence(affected);
      return;
    }
    if (error is SessionChanged) return;
    cache.invalidate(affected);
    if (affected.contains(Endpoints.meFavorites)) {
      favoriteIndex.resetFavoriteIndex();
    }
    snapshots.removeWhere((_, s) => s.tags.intersection(affected).isNotEmpty);
    if (error != null) return;
    if (path.startsWith(Endpoints.articles) &&
        !path.endsWith(Endpoints.likeSuffix) &&
        !path.endsWith(Endpoints.commentsSuffix)) {
      articleReader.aliases.clear();
    }
    if (path.startsWith(Endpoints.profile)) {
      images.clear();
    }
    if (path.endsWith(Endpoints.likeSuffix) && result is Map) {
      final id = int.tryParse(Endpoints.articleId(path) ?? '');
      if (id != null) {
        setReaction(
          id,
          liked: result['liked'] as bool?,
          count: (result['likeCount'] as num?)?.toInt(),
        );
      }
    }
    if (path.startsWith(Endpoints.meFavorites)) {
      final id = method == 'POST' && data is Map
          ? data['articleId'] as int?
          : int.tryParse(path.split('/').last);
      if (id != null) setReaction(id, favorite: method == 'POST');
    }
  }

  void saveSnapshot(String key, FeedSnapshot value) {
    snapshots.remove(key);
    snapshots[key] = value;
    while (snapshots.length > CacheLimits.feedSnapshots) {
      snapshots.remove(snapshots.keys.first);
    }
  }

  // 会话隔离清理不影响公开资源，也不触及按账号保存的投稿草稿。
  void resetPrivate() {
    CodeCache.clear();
    images.resetPrivate();
    favoriteIndex.resetFavoriteIndex();
    reactions.clear();
    favoriteIndex.overrides.clear();
    snapshots.removeWhere((_, s) => s.tags.contains('private'));
    cache.invalidate({'private'});
    reactionStore.events.add(-1);
  }

  Future<int> cacheBytes() async =>
      (await cache.disk.size()) + (await images.disk.size());
  Future<void> clear() async {
    CodeCache.clear();
    favoriteIndex.resetFavoriteIndex();
    snapshots.clear();
    reactions.clear();
    favoriteIndex.overrides.clear();
    articleReader.aliases.clear();
    await Future.wait([cache.clear(), images.clear()]);
  }
}
