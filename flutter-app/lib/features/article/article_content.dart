part of '../article_page.dart';

/// 阅读内容只组合已拆分的展示组件，网络请求和乐观更新留在页面状态中。
class _ArticleContent extends StatelessWidget {
  const _ArticleContent({
    required this.a,
    required this.preview,
    required this.scroll,
    required this.likes,
    required this.toc,
    required this.keys,
    required this.reactions,
    required this.adjacent,
    required this.commentKey,
    required this.epoch,
  });
  final Article a;
  final bool preview;
  final ScrollController scroll;
  final int likes;
  final List<ApiTocItem> toc;
  final Map<String, GlobalKey> keys;
  final Widget reactions;
  final Map<String, dynamic> adjacent;
  final GlobalKey commentKey;
  final int epoch;
  @override
  Widget build(BuildContext context) => SingleChildScrollView(
    controller: scroll,
    keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
    padding: AppInsets.page,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (preview)
          Padding(
            padding: AppInsets.groupBottom,
            child: Row(
              children: [
                StatusBadge(a.status),
                const SizedBox(width: 12),
                const Text('仅本人可见的稿件预览'),
              ],
            ),
          ),
        if (!preview) ...[
          _ArticleBreadcrumb(a: a),
          const SizedBox(height: 16),
          _ArticleCategory(a: a),
        ],
        _ArticleTitle(a: a),
        _AuthorBar(a: a, likes: likes),
        if (a.data.summary?.isNotEmpty == true) _ArticleSummary(a: a),
        ReaderMarkdown(
          a.content,
          publicImages: !preview,
          toc: preview ? const [] : toc,
          headingKeys: keys,
        ),
        const SizedBox(height: 24),
        _ArticleTags(a: a),
        if (!preview && a.status == 'published') ...[
          reactions,
          for (final entry in adjacent.entries)
            if (entry.value is Map) _AdjacentArticle(entry: entry),
          Comments(
            a.id,
            composerKey: commentKey,
            key: ValueKey('${a.id}-$epoch'),
          ),
        ],
        const SizedBox(height: 24),
      ],
    ),
  );
}
