part of 'home_page.dart';

/// 首页阅读分区通过同一仓库加载，保留缓存与入口顺序。
class _HomePopular extends ConsumerWidget {
  const _HomePopular();

  @override
  Widget build(BuildContext context, WidgetRef ref) => Column(
    children: [
      SectionTitle('热门阅读', action: '更多', onTap: () => context.push('/tags')),
      AsyncPane<PageResult<Article>>(
        load: () => ref
            .read(repositoryProvider)
            .articles(query: {'sort': '-viewCount', 'pageSize': 5}),
        builder: (p, _) => Column(
          children: [
            for (var i = 0; i < p.items.length; i++)
              _PopularArticle(article: p.items[i], rank: i + 1),
          ],
        ),
      ),
      const SizedBox(height: 24),
    ],
  );
}
