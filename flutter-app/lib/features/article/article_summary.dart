part of '../article_page.dart';

/// 摘要强调块与正文独立，保留左侧主题色边框。
class _ArticleSummary extends StatelessWidget {
  const _ArticleSummary({required this.a});
  final Article a;
  @override
  Widget build(BuildContext context) => Container(
    padding: AppInsets.page,
    margin: AppInsets.summaryBottom,
    decoration: BoxDecoration(
      color: context.colors.surfaceSunken,
      border: Border(
        left: BorderSide(color: context.colors.brandSubtle, width: 3),
      ),
      borderRadius: const BorderRadius.horizontal(right: Radius.circular(6)),
    ),
    child: Text(
      a.data.summary!,
      style: TextStyle(
        fontSize: AppType.label,
        height: 1.8,
        color: context.colors.textMuted,
      ),
    ),
  );
}
