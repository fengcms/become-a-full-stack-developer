import 'dart:async';
import 'dart:convert';

import '../core/cache/data_cache.dart';
import '../core/cache/image_store.dart';
import '../core/markdown/code_cache.dart';
import '../core/generated/models.dart';
import '../core/network/api_client.dart';

Map<String, dynamic> jsonMap(dynamic value) =>
    Map<String, dynamic>.from(value as Map);

class Article {
  Article.fromJson(Map<String, dynamic> json, {this.progress})
    : data = ApiArticleSummary.fromJson(json),
      content = json['content'] as String? ?? '';
  final ApiArticleSummary data;
  final String content;
  final num? progress;
  int get id => data.id!;
  String get title => data.title ?? '';
  String get route =>
      data.slug?.isNotEmpty == true ? data.slug! : id.toString();
  String get author => data.authorName ?? '会员';
  String get status => data.status ?? 'published';
}

class PageResult<T> {
  PageResult(this.items, this.page, this.pages, this.total);
  final List<T> items;
  final int page, pages, total;
  bool get hasMore => page < pages;
  factory PageResult.fromJson(
    dynamic input,
    T Function(Map<String, dynamic>) decode,
  ) {
    final j = jsonMap(input);
    final p = ApiPagination.fromJson(jsonMap(j['pagination']));
    return PageResult(
      (j['list'] as List).map((e) => decode(jsonMap(e))).toList(),
      p.page ?? 1,
      p.totalPages ?? 1,
      p.total ?? 0,
    );
  }
}

class ReaderRepository {
  ReaderRepository(this.api, {DataCache? cache})
    : cache = cache ?? DataCache() {
    api.onMutation = _mutation;
    api.onSessionChanged = resetPrivate;
    this.cache.events.listen((e) {
      if (e.kind == 'removed' && e.key.contains('/reader/article/')) {
        _aliases.clear();
        this.cache.invalidate({'articleLists'});
      }
    });
  }
  final ApiClient api;
  final DataCache cache;
  late final ImageStore images = ImageStore(api.dio, namespace: api.baseUrl);
  final _aliases = <String, String>{};
  final reactions = <int, Map<String, dynamic>>{};
  final _reactionEvents = StreamController<int>.broadcast();
  Stream<int> get reactionEvents => _reactionEvents.stream;
  final snapshots = <String, FeedSnapshot>{};
  final _favoriteIndex = <int>{};
  int _favoritePage = 0, _favoriteVersion = 0;
  bool _favoriteComplete = false;
  DateTime? _favoriteTime;
  Future<void>? _favoriteScan;
  void resetFavoriteIndex() {
    _favoriteVersion++;
    _favoriteIndex.clear();
    _favoritePage = 0;
    _favoriteComplete = false;
    _favoriteTime = null;
    _favoriteScan = null;
  }

  final _favoriteOverrides = <int, (bool, DateTime)>{};
  static final _force = Object(), _tracking = Object();
  Future<T> force<T>(Future<T> Function() task) =>
      runZoned(task, zoneValues: {_force: true});
  Future<T> track<T>(Set<String> keys, Future<T> Function() task) =>
      runZoned(task, zoneValues: {_tracking: keys});
  bool get forced => Zone.current[_force] == true;

  String key(String path, Map<String, dynamic> query, {bool private = false}) {
    final sorted = Map.fromEntries(
      query.entries.toList()..sort((a, b) => a.key.compareTo(b.key)),
    );
    return jsonEncode([
      'v1',
      api.baseUrl,
      private ? 'session:${api.userId}:${api.epoch}' : 'public',
      path,
      sorted,
    ]);
  }

  String feedTag(String path, Map<String, dynamic> query) =>
      'feed:${key(path, {'pageSize': 12, ...query}..remove('page'), private: path.startsWith('/me/'))}';

  bool forbidden(Object e) =>
      e is ApiFailure &&
      ([401, 403, 404].contains(e.status) ||
          [1003, 1004, 1005, 2001, 3001].contains(e.code));
  CachePolicy? policy(String path) {
    const day = Duration(hours: 24), minute = Duration(minutes: 1);
    if (path == '/categories/tree' || path == '/site/settings') {
      return const CachePolicy(Duration(minutes: 30), day, disk: true);
    }
    if (path == '/categories/stats' || path == '/tags') {
      return const CachePolicy(Duration(minutes: 5), day, disk: true);
    }
    if (path == '/articles') {
      return const CachePolicy(Duration(minutes: 2), day, disk: true);
    }
    if (path == '/search') {
      return const CachePolicy(Duration(minutes: 2), Duration(minutes: 10));
    }
    if (path.startsWith('/members/') || path.endsWith('/adjacent')) {
      return const CachePolicy(Duration(minutes: 5), Duration(hours: 1));
    }
    if (path.endsWith('/comments')) {
      return const CachePolicy(Duration(seconds: 30), Duration(minutes: 5));
    }
    if (path.endsWith('/like/status') ||
        ['/me/favorites', '/me/likes', '/me/history'].contains(path)) {
      return const CachePolicy(Duration(seconds: 30), Duration(minutes: 5));
    }
    if (path.startsWith('/me/notifications')) {
      return const CachePolicy(Duration(seconds: 15), minute);
    }
    if (path == '/me/articles') {
      return const CachePolicy(Duration(seconds: 15), minute);
    }
    return null;
  }

  Set<String> resourceTags(String path) {
    final id = RegExp(r'^/articles/([^/]+)').firstMatch(path)?.group(1);
    return {
      path,
      if (path.startsWith('/me/')) 'private',
      if (path.startsWith('/me/notifications')) 'notifications',
      if (id != null && path.endsWith('/comments')) ...{
        'comments:$id',
        'comments',
      },
      if (id != null && path.endsWith('/like/status')) ...{
        'private',
        'reactions:$id',
      },
      if (path == '/articles' ||
          path == '/search' ||
          path.startsWith('/members/'))
        'articleLists',
    };
  }

  Future<CacheReply> fetch(
    String path, {
    Map<String, dynamic> query = const {},
    bool anonymous = false,
  }) async {
    String control = '';
    Duration age = Duration.zero;
    final data = await api.request(
      path,
      query: query,
      anonymous: anonymous,
      onHeaders: (headers) {
        control = headers.value('cache-control') ?? '';
        age = Duration(seconds: int.tryParse(headers.value('age') ?? '') ?? 0);
      },
    );
    return CacheReply(data, control: control, age: age);
  }

  Future<dynamic> read(
    String path, {
    Map<String, dynamic> query = const {},
    bool force = false,
  }) {
    var p = policy(path);
    if (p == null) return api.request(path, query: query);
    if (path == '/articles' && query['sort'] == '-viewCount') {
      p = const CachePolicy(
        Duration(minutes: 5),
        Duration(hours: 24),
        disk: true,
      );
    }
    if ((query['page'] as int? ?? 1) > 3) p = CachePolicy(p.fresh, p.maxAge);
    final private = path.startsWith('/me/') || path.endsWith('/like/status');
    final k = key(path, query, private: private);
    (Zone.current[_tracking] as Set<String>?)?.add(k);
    return cache.get(
      k,
      p,
      () async {
        final result = await fetch(path, query: query, anonymous: !private);
        final value = result.value;
        if ([
          '/tags',
          '/categories/tree',
          '/categories/stats',
          '/me/likes',
        ].contains(path)) {
          if (value is! List) throw const FormatException('列表响应格式不正确');
        } else if (path == '/articles' ||
            path.endsWith('/comments') ||
            [
              '/me/favorites',
              '/me/history',
              '/me/articles',
              '/me/notifications',
            ].contains(path)) {
          if (value is! List &&
              (value is! Map ||
                  value['list'] is! List ||
                  value['pagination'] is! Map)) {
            throw const FormatException('分页响应格式不正确');
          }
        } else if (value is! Map) {
          throw const FormatException('响应格式不正确');
        }
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

  Future<Map<String, dynamic>> bundle(String id, {bool force = false}) async {
    var canonical = _aliases[id] ?? id;
    if (!_aliases.containsKey(id) && !force && !forced) {
      final persisted = await cache.disk.findKey(
        (key, meta) =>
            (meta['aliases'] as List? ?? []).contains(id) &&
            (jsonDecode(key) as List)[1] == api.baseUrl,
      );
      if (persisted != null) {
        canonical = ((jsonDecode(persisted) as List)[3] as String).substring(
          '/reader/article/'.length,
        );
      }
    }
    final k = key('/reader/article/$canonical', const {});
    (Zone.current[_tracking] as Set<String>?)?.add(k);
    final data = jsonMap(
      await cache.get(
        k,
        const CachePolicy(
          Duration(minutes: 10),
          Duration(hours: 24),
          disk: true,
        ),
        () async {
          final response = await fetch('/articles/$canonical', anonymous: true);
          final a = jsonMap(response.value);
          if (a['status'] != 'published') {
            throw const ApiFailure('内容不存在或暂不可见', code: 3001, status: 404);
          }
          // TOC and content are installed together. Never attach a previous TOC to new content.
          final toc = await fetch('/articles/${a['id']}/toc', anonymous: true);
          if (toc.value is! List ||
              a['id'] is! int ||
              a['content'] is! String) {
            throw const FormatException('文章或目录响应格式不正确');
          }
          // When a version is available, verify that publication did not change while fetching the TOC.
          if (a['updatedAt'] != null) {
            final check = jsonMap(
              (await fetch('/articles/${a['id']}', anonymous: true)).value,
            );
            if (check['updatedAt'] != a['updatedAt'] ||
                check['content'] != a['content'] ||
                check['status'] != 'published') {
              throw const ApiFailure('文章刚刚发生更新，请刷新后继续阅读', code: 3003);
            }
          }
          final control = '${response.control},${toc.control}';
          return CacheReply(
            {'article': a, 'toc': toc.value},
            control: control,
            age: response.age,
          );
        },
        force: force || forced,
        tags: {'article:$canonical', 'articleBodies'},
        forbidden: forbidden,
      ),
    );
    final a = jsonMap(data['article']);
    if (_aliases.length > 300) _aliases.clear();
    _aliases['${a['id']}'] = canonical;
    if (a['slug'] is String) _aliases[a['slug']] = canonical;
    return data;
  }

  Future<Article> article(String id, {bool private = false}) async =>
      Article.fromJson(
        private
            ? jsonMap(await api.request('/articles/$id'))
            : jsonMap((await bundle(id))['article']),
      );
  Future<List<ApiTocItem>> toc(int id) async =>
      ((await bundle('$id'))['toc'] as List)
          .map((j) => ApiTocItem.fromJson(jsonMap(j)))
          .toList();

  Future<PageResult<Article>> articles({
    int page = 1,
    String path = '/articles',
    Map<String, dynamic> query = const {},
    bool force = false,
  }) async {
    var data = await read(
      path,
      query: {'page': page, 'pageSize': 12, ...query},
      force: force,
    );
    if (path == '/search') data = data['articles'];
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
      (await read('/categories/tree') as List)
          .map((j) => ApiCategoryNode.fromJson(jsonMap(j)))
          .toList();
  Future<List<ApiTag>> tagsList() async => (await read('/tags') as List)
      .map((j) => ApiTag.fromJson(jsonMap(j)))
      .toList();
  Future<List<ApiTag>> tags() => tagsList();
  Future<PageResult<ApiComment>> comments(
    int id,
    int page, {
    bool force = false,
  }) async => PageResult.fromJson(
    await read(
      '/articles/$id/comments',
      query: {'page': page, 'pageSize': 20, 'sort': 'createdAt'},
      force: force,
    ),
    ApiComment.fromJson,
  );

  Future<bool> favorite(int id) async {
    final known = _favoriteOverrides[id];
    if (!forced &&
        known != null &&
        DateTime.now().difference(known.$2) < const Duration(seconds: 30)) {
      return known.$1;
    }
    if (forced ||
        (_favoriteScan == null &&
            _favoriteTime != null &&
            DateTime.now().difference(_favoriteTime!) >=
                const Duration(seconds: 30))) {
      resetFavoriteIndex();
    }
    while (true) {
      if (_favoriteIndex.contains(id)) return true;
      if (_favoriteComplete) return false;
      try {
        await (_favoriteScan ??= _scanFavoritePage());
      } on CacheSuperseded {
        continue;
      }
    }
  }

  Future<void> _scanFavoritePage() async {
    final version = _favoriteVersion;
    try {
      final next = _favoritePage + 1;
      final page = await articles(path: '/me/favorites', page: next);
      if (version != _favoriteVersion) throw CacheSuperseded();
      _favoriteIndex.addAll(page.items.map((a) => a.id));
      _favoritePage = next;
      _favoriteComplete = !page.hasMore;
      _favoriteTime ??=
          cache.savedAt(
            key('/me/favorites', {'page': next, 'pageSize': 12}, private: true),
          ) ??
          DateTime.now();
    } finally {
      if (version == _favoriteVersion) _favoriteScan = null;
    }
  }

  Future<Map<String, dynamic>> overview() async {
    final k = key('/reader/overview', const {}, private: true);
    (Zone.current[_tracking] as Set<String>?)?.add(k);
    return jsonMap(
      await cache.get(
        k,
        const CachePolicy(Duration(minutes: 1), Duration(minutes: 5)),
        () async {
          final results = await Future.wait(
            [
              '/me/favorites',
              '/me/history',
              '/me/articles',
            ].map((p) => read(p, query: {'page': 1, 'pageSize': 3})),
          );
          int likes = 0, page = 1;
          while (true) {
            final batch = await read(
              '/me/likes',
              query: {'page': page, 'pageSize': 100},
            ) as List;
            likes += batch.length;
            if (batch.length < 100) break;
            page++;
          }
          return CacheReply({
            'counts': [
              results[0]['pagination']['total'],
              likes,
              results[1]['pagination']['total'],
              results[2]['pagination']['total'],
            ],
            'history': results[1]['list'],
          });
        },
        force: forced,
        tags: {'private', 'overview'},
        forbidden: forbidden,
      ),
    );
  }

  void setReaction(
    int id, {
    bool? liked,
    int? count,
    bool? favorite,
    bool local = true,
  }) {
    final old = reactions[id] ?? {};
    if (reactions.length >= 300 && !reactions.containsKey(id)) {
      reactions.remove(reactions.keys.first);
    }
    reactions[id] = {
      ...old,
      'savedAt': DateTime.now().millisecondsSinceEpoch,
      'liked': ?liked,
      'likeCount': ?count,
      'favorite': ?favorite,
    };
    if (local && liked != null && count != null) {
      final path = '/articles/$id/like/status';
      cache.seed(
        key(path, const {}, private: true),
        {'liked': liked, 'likeCount': count},
        policy(path)!,
        resourceTags(path),
      );
    }
    if (_favoriteOverrides.length >= 300 &&
        !_favoriteOverrides.containsKey(id)) {
      _favoriteOverrides.remove(_favoriteOverrides.keys.first);
    }
    if (local && favorite != null) {
      _favoriteOverrides[id] = (favorite, DateTime.now());
    }
    if (count != null) {
      dynamic patch(dynamic value) {
        if (value is List) return value.map(patch).toList();
        if (value is Map) {
          return {
            for (final e in value.entries)
              e.key:
                  e.key == 'likeCount' &&
                      value['id'] == id &&
                      value.containsKey('title')
                  ? count
                  : patch(e.value),
          };
        }
        return value;
      }

      cache.patch(patch);
    }
    _reactionEvents.add(id);
  }

  Set<String> _mutationTags(String path, Object? data) {
    final article = RegExp(r'^/articles/(\d+)').firstMatch(path)?.group(1);
    if (path.endsWith('/like')) {
      return {'reactions:$article', '/me/likes', 'overview'};
    }
    if (path.startsWith('/me/favorites')) return {'/me/favorites', 'overview'};
    if (path.startsWith('/me/history')) return {'/me/history', 'overview'};
    if (path.startsWith('/me/notifications')) return {'notifications'};
    if (path.endsWith('/comments')) return {'comments:$article'};
    if (path.startsWith('/comments/')) return {'comments'};
    if (path.startsWith('/articles')) {
      return {
        'articleBodies',
        'articleLists',
        '/me/articles',
        'overview',
        '/tags',
        '/categories/stats',
      };
    }
    if (path.startsWith('/me/profile')) return {'profile', 'articleLists'};
    return {};
  }

  void _mutation(
    String path,
    String method,
    Object? data,
    bool started,
    dynamic result,
    Object? error,
  ) {
    final affected = _mutationTags(path, data);
    if (started) {
      cache.fence(affected);
      return;
    }
    if (error is SessionChanged) return;
    cache.invalidate(affected);
    if (affected.contains('/me/favorites')) resetFavoriteIndex();
    snapshots.removeWhere((_, s) => s.tags.intersection(affected).isNotEmpty);
    if (error != null) return;
    if (path.startsWith('/articles') &&
        !path.endsWith('/like') &&
        !path.endsWith('/comments')) {
      _aliases.clear();
    }
    if (path.startsWith('/me/profile')) {
      images.clear();
    }
    if (path.endsWith('/like') && result is Map) {
      final id = int.tryParse(path.split('/')[2]);
      if (id != null) {
        setReaction(
          id,
          liked: result['liked'] as bool?,
          count: (result['likeCount'] as num?)?.toInt(),
        );
      }
    }
    if (path.startsWith('/me/favorites')) {
      final id = method == 'POST' && data is Map
          ? data['articleId'] as int?
          : int.tryParse(path.split('/').last);
      if (id != null) setReaction(id, favorite: method == 'POST');
    }
  }

  void saveSnapshot(String key, FeedSnapshot value) {
    snapshots.remove(key);
    snapshots[key] = value;
    while (snapshots.length > 10) {
      snapshots.remove(snapshots.keys.first);
    }
  }

  void resetPrivate() {
    CodeCache.clear();
    images.resetPrivate();
    resetFavoriteIndex();
    reactions.clear();
    _favoriteOverrides.clear();
    snapshots.removeWhere((_, s) => s.tags.contains('private'));
    cache.invalidate({'private'});
    _reactionEvents.add(-1);
  }

  Future<int> cacheBytes() async =>
      (await cache.disk.size()) + (await images.disk.size());
  Future<void> clear() async {
    CodeCache.clear();
    resetFavoriteIndex();
    snapshots.clear();
    reactions.clear();
    _favoriteOverrides.clear();
    _aliases.clear();
    await Future.wait([cache.clear(), images.clear()]);
  }
}

class FeedSnapshot {
  FeedSnapshot(
    this.items,
    this.page,
    this.more,
    this.offset,
    this.tags,
    this.saved,
  );
  final List<Article> items;
  final int page;
  final bool more;
  final double offset;
  final Set<String> tags;
  final DateTime saved;
}
