import '../../core/cache/cache_limits.dart';
import '../../core/cache/data_cache.dart';
import '../../core/network/endpoints.dart';

/// 接口资源分类只在此判断一次；读策略、响应校验与写后失效共用同一结果。
enum ResourceFamily {
  dictionaries,
  statistics,
  articleList,
  search,
  member,
  adjacent,
  comments,
  reaction,
  favorites,
  likes,
  history,
  notifications,
  manuscripts,
  article,
  comment,
  profile,
  unknown,
}

enum _Shape { object, list, page }

class _ReadRule {
  const _ReadRule(this.policy, this.shape, {this.tags = const {}});
  final CachePolicy policy;
  final _Shape shape;
  final Set<String> tags;
}

/// 没有显式读规则的端点直接联网，避免误缓存登录、上传和私有稿件正文。
class CachePolicyTable {
  static const _day = Duration(hours: 24);
  static const _short = CachePolicy(
    Duration(seconds: 30),
    Duration(minutes: 5),
  );
  static const _rules = {
    ResourceFamily.dictionaries: _ReadRule(
      CachePolicy(Duration(minutes: 30), _day, disk: true),
      _Shape.list,
    ),
    ResourceFamily.statistics: _ReadRule(
      CachePolicy(Duration(minutes: 5), _day, disk: true),
      _Shape.list,
    ),
    ResourceFamily.articleList: _ReadRule(
      CachePolicy(Duration(minutes: 2), _day, disk: true),
      _Shape.page,
      tags: {'articleLists'},
    ),
    ResourceFamily.search: _ReadRule(
      CachePolicy(Duration(minutes: 2), Duration(minutes: 10)),
      _Shape.object,
      tags: {'articleLists', CacheTags.searchResults},
    ),
    ResourceFamily.member: _ReadRule(
      CachePolicy(Duration(minutes: 5), Duration(hours: 1)),
      _Shape.object,
      tags: {'articleLists'},
    ),
    ResourceFamily.adjacent: _ReadRule(
      CachePolicy(Duration(minutes: 5), Duration(hours: 1)),
      _Shape.object,
    ),
    ResourceFamily.comments: _ReadRule(_short, _Shape.page, tags: {'comments'}),
    ResourceFamily.reaction: _ReadRule(
      _short,
      _Shape.object,
      tags: {'private'},
    ),
    ResourceFamily.favorites: _ReadRule(_short, _Shape.page, tags: {'private'}),
    ResourceFamily.likes: _ReadRule(_short, _Shape.list, tags: {'private'}),
    ResourceFamily.history: _ReadRule(_short, _Shape.page, tags: {'private'}),
    ResourceFamily.notifications: _ReadRule(
      CachePolicy(Duration(seconds: 15), Duration(minutes: 1)),
      _Shape.page,
      tags: {'private', 'notifications'},
    ),
    ResourceFamily.manuscripts: _ReadRule(
      CachePolicy(Duration(seconds: 15), Duration(minutes: 1)),
      _Shape.page,
      tags: {'private'},
    ),
  };

  /// 更具体的子资源优先匹配，不能先把 /articles/id/comments 归为正文。
  ResourceFamily family(String path) {
    if ([Endpoints.categoriesTree, Endpoints.siteSettings].contains(path)) {
      return ResourceFamily.dictionaries;
    }
    if ([Endpoints.categoriesStats, Endpoints.tags].contains(path)) {
      return ResourceFamily.statistics;
    }
    if (path == Endpoints.articles) return ResourceFamily.articleList;
    if (path == Endpoints.search) return ResourceFamily.search;
    if (path.startsWith(Endpoints.memberPrefix)) return ResourceFamily.member;
    if (path.endsWith(Endpoints.adjacentSuffix)) return ResourceFamily.adjacent;
    if (path.endsWith(Endpoints.commentsSuffix)) return ResourceFamily.comments;
    if (path.endsWith(Endpoints.likeStatusSuffix) ||
        path.endsWith(Endpoints.likeSuffix)) {
      return ResourceFamily.reaction;
    }
    if (path.startsWith(Endpoints.meFavorites)) return ResourceFamily.favorites;
    if (path.startsWith(Endpoints.meLikes)) return ResourceFamily.likes;
    if (path.startsWith(Endpoints.meHistory)) return ResourceFamily.history;
    if (path.startsWith(Endpoints.meNotifications)) {
      return ResourceFamily.notifications;
    }
    if (path == Endpoints.meArticles) return ResourceFamily.manuscripts;
    if (path.startsWith(Endpoints.commentPrefix)) return ResourceFamily.comment;
    if (path.startsWith(Endpoints.articles)) return ResourceFamily.article;
    if (path.startsWith(Endpoints.profile)) return ResourceFamily.profile;
    return ResourceFamily.unknown;
  }

  /// 互动状态可读缓存，点赞写端点本身不进入 GET 缓存规则。
  CachePolicy? policy(String path) =>
      path.endsWith(Endpoints.likeSuffix) ? null : _rules[family(path)]?.policy;

  Set<String> resourceTags(String path) {
    final kind = family(path), id = Endpoints.articleId(path);
    return {
      path,
      ...?_rules[kind]?.tags,
      if (path.startsWith(Endpoints.privatePrefix)) 'private',
      if (kind == ResourceFamily.comments) 'comments:$id',
      if (kind == ResourceFamily.reaction) 'reactions:$id',
    };
  }

  /// 写操作开始先隔断旧请求，结束后按相同分类失效关联摘要与会员统计。
  Set<String> mutationTags(String path, Object? data) => switch (family(path)) {
    ResourceFamily.reaction => {
      'reactions:${Endpoints.articleId(path)}',
      Endpoints.meLikes,
      'overview',
    },
    ResourceFamily.favorites => {Endpoints.meFavorites, 'overview'},
    ResourceFamily.history => {Endpoints.meHistory, 'overview'},
    ResourceFamily.notifications => {'notifications'},
    ResourceFamily.comments => {'comments:${Endpoints.articleId(path)}'},
    ResourceFamily.comment => {'comments'},
    ResourceFamily.article || ResourceFamily.articleList => {
      CacheTags.articleBodies,
      'articleLists',
      Endpoints.meArticles,
      'overview',
      Endpoints.tags,
      Endpoints.categoriesStats,
    },
    ResourceFamily.profile => {'profile', 'articleLists'},
    _ => {},
  };

  /// 校验后才允许写入缓存，拒绝把错误响应长期当成有效页面。
  void validate(String path, dynamic value) {
    final shape = switch (path) {
      Endpoints.siteSettings || Endpoints.unreadCount => _Shape.object,
      _ => _rules[family(path)]?.shape ?? _Shape.object,
    };
    final valid = switch (shape) {
      _Shape.list => value is List,
      _Shape.object => value is Map,
      _Shape.page =>
        value is List ||
            (value is Map &&
                value['list'] is List &&
                value['pagination'] is Map),
    };
    if (!valid) throw const FormatException('响应格式不正确');
  }

  /// 热门列表更新较慢；仅前三页可落盘，后续翻页仍受内存容量约束。
  CachePolicy forQuery(String path, Map<String, dynamic> query, CachePolicy p) {
    if (path == Endpoints.articles && query['sort'] == '-viewCount') {
      p = const CachePolicy(Duration(minutes: 5), _day, disk: true);
    }
    if ((query['page'] as int? ?? 1) > 3) p = CachePolicy(p.fresh, p.maxAge);
    return p;
  }
}
