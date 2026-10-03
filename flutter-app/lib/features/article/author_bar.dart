part of '../article_page.dart';

/// 作者与阅读统计共享同一份乐观点赞数量。
class _AuthorBar extends StatelessWidget {
  const _AuthorBar({required this.a, required this.likes});
  final Article a;
  final int likes;
  @override
  Widget build(BuildContext context) => Container(
    padding: AppInsets.sectionBottom,
    margin: AppInsets.sectionBottom,
    decoration: BoxDecoration(
      border: Border(bottom: BorderSide(color: context.colors.line)),
    ),
    child: InkWell(
      onTap: () => context.push('/members/${a.data.authorId}'),
      child: Row(
        children: [
          CircleAvatar(
            radius: 18,
            backgroundColor: context.colors.brandSubtle,
            foregroundColor: context.colors.brandOnSubtle,
            child: Text(a.author.characters.first),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  a.author,
                  style: const TextStyle(
                    fontSize: AppType.label,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                Text(
                  '${a.data.publishedAt?.split('T').first ?? ''} · ${a.data.viewCount ?? 0} 阅读 · $likes 赞',
                  style: context.text.labelSmall,
                ),
              ],
            ),
          ),
          const PrototypeIcon('more'),
        ],
      ),
    ),
  );
}
