part of 'search_page.dart';

/// 搜索结果以关键词建立列表身份，切词重建、返回恢复。
class _SearchResults extends StatelessWidget {
  const _SearchResults({
    required this.query,
    required this.history,
    required this.search,
    required this.clearHistory,
  });
  final String query;
  final List<String> history;
  final void Function(String?) search;
  final VoidCallback clearHistory;
  @override
  Widget build(BuildContext context) => Expanded(
    child: query.isEmpty
        ? _SearchSuggestions(
            history: history,
            search: search,
            clearHistory: clearHistory,
          )
        : ArticleFeed(
            key: ValueKey(query),
            path: Endpoints.search,
            header: const SectionTitle('搜索结果'),
            query: {'q': query, 'type': 'article'},
          ),
  );
}
