part of 'focus_stories.dart';

/// 焦点卡片保持原型渐变、标题截断与文章入口。
class _StoryCard extends StatelessWidget {
  const _StoryCard({required this.a});
  final Article a;
  @override
  Widget build(BuildContext context) => Padding(
    padding: AppInsets.pageTop,
    child: Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () => context.push('/articles/${a.route}'),
        borderRadius: AppRadius.rMd,
        child: Ink(
          decoration: BoxDecoration(
            gradient: context.colors.heroWash,
            borderRadius: AppRadius.rMd,
          ),
          child: Stack(
            children: [
              Positioned(
                right: 14,
                top: -6,
                child: Text(
                  '{ API }',
                  style: TextStyle(
                    fontFamily: 'monospace',
                    fontSize: AppType.heroWatermark,
                    fontWeight: FontWeight.w600,
                    color: context.colors.textTitle.withValues(alpha: .08),
                  ),
                ),
              ),
              Padding(
                padding: AppInsets.page,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '焦点阅读',
                      style: TextStyle(
                        fontSize: AppType.micro,
                        fontWeight: FontWeight.w600,
                        color: context.colors.brandOnSubtle,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      a.title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: AppType.avatarLetter,
                        height: 1.32,
                        fontWeight: FontWeight.w700,
                        color: context.colors.textTitle,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      a.data.summary ?? '',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: AppType.caption,
                        height: 1.62,
                        color: context.colors.textMuted,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}
