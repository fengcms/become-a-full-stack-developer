import '../../core/generated/models.dart';

Map<String, dynamic> jsonMap(dynamic value) =>
    Map<String, dynamic>.from(value as Map);

/// 领域文章模型将摘要、正文与阅读进度组合，统一处理 id 与 slug 路由。
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

/// 分页结果保留服务端页数；裸数组接口由仓库单独推断是否还有下一页。
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

/// 列表离开时保存数据、位置和依赖标签；恢复后仍须核对有效期。
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
