part of 'focus_stories.dart';

/// 指示器只消费轮播页码，文本同步提供当前位置。
class _PageDots extends StatelessWidget {
  const _PageDots({required this.count, required this.current});
  final int count;
  final int current;
  @override
  Widget build(BuildContext context) => Row(
    children: [
      for (var i = 0; i < count; i++)
        Container(
          margin: AppInsets.metadataRight,
          width: 20,
          height: 4,
          decoration: BoxDecoration(
            color: context.colors.brand.withValues(
              alpha: i == current ? 1 : .28,
            ),
            borderRadius: BorderRadius.circular(2),
          ),
        ),
      const SizedBox(width: 6),
      Text('${current + 1} / $count', style: context.text.labelSmall),
    ],
  );
}
