part of 'home_page.dart';

/// 首页阅读分区通过同一仓库加载，保留缓存与入口顺序。
class _HomeLatest extends ConsumerWidget {
  const _HomeLatest();

  @override
  Widget build(BuildContext context, WidgetRef ref) => Column(
    children: [
      AsyncPane<PageResult<Article>>(
        load: () => ref
            .read(repositoryProvider)
            .articles(query: {'sort': '-publishedAt', 'pageSize': 3}),
        builder: (p, _) =>
            p.items.isEmpty ? const SizedBox() : FocusStories(p.items),
      ),
      SectionTitle(
        '最新文章',
        action: '全部',
        onTap: () => context.go('/categories'),
      ),
    ],
  );
}
