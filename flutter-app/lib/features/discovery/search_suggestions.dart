part of 'search_page.dart';

/// 历史和热门标签共用搜索入口，清除动作交给页面。
class _SearchSuggestions extends ConsumerWidget {
  const _SearchSuggestions({
    required this.history,
    required this.search,
    required this.clearHistory,
  });
  final List<String> history;
  final void Function(String?) search;
  final VoidCallback clearHistory;
  @override
  Widget build(BuildContext context, WidgetRef ref) => ListView(
    children: [
      Padding(
        padding: AppInsets.pageTop,
        child: Row(
          children: [
            Expanded(
              child: Text(
                '搜索历史',
                style: TextStyle(
                  fontSize: AppType.caption,
                  fontWeight: FontWeight.w600,
                  color: context.colors.textMuted,
                ),
              ),
            ),
            if (history.isNotEmpty)
              TextButton(onPressed: clearHistory, child: const Text('清空')),
          ],
        ),
      ),
      Padding(
        padding: AppInsets.page,
        child: Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final term in history)
              ActionChip(label: Text(term), onPressed: () => search(term)),
          ],
        ),
      ),
      SectionTitle('热门标签', action: '全部', onTap: () => context.push('/tags')),
      AsyncPane<List<ApiTag>>(
        load: ref.read(repositoryProvider).tags,
        builder: (tags, reload) => Padding(
          padding: AppInsets.page,
          child: Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final t in tags.take(8))
                ActionChip(
                  label: Text(t.name ?? ''),
                  onPressed: () => search(t.name),
                ),
            ],
          ),
        ),
      ),
    ],
  );
}
