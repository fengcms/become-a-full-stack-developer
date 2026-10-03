part of 'home_page.dart';

/// 品牌标题保持原型字标与主题配色。
class _BrandTitle extends StatelessWidget {
  const _BrandTitle();

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Container(
        padding: AppInsets.tinyBadge,
        decoration: BoxDecoration(
          color: context.colors.brandSubtle,
          borderRadius: AppRadius.rXs,
        ),
        child: Text(
          '{ }',
          style: TextStyle(
            fontFamily: 'monospace',
            fontSize: AppType.body,
            fontWeight: FontWeight.w700,
            color: context.colors.brandOnSubtle,
          ),
        ),
      ),
      const SizedBox(width: 8),
      Text(
        '成为全栈',
        style: TextStyle(
          fontSize: AppType.listTitle,
          fontWeight: FontWeight.w700,
          color: context.colors.textTitle,
        ),
      ),
    ],
  );
}
