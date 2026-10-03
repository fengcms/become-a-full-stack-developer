part of '../article_page.dart';

/// 单个互动按钮的点击态与主题外观；提交状态由页面控制。
class _ArticleAction extends StatelessWidget {
  const _ArticleAction(this.icon, this.label, this.tap, {this.active = false});
  final String icon, label;
  final VoidCallback? tap;
  final bool active;
  @override
  Widget build(BuildContext context) => InkWell(
    onTap: tap,
    child: Container(
      constraints: const BoxConstraints(minWidth: 72, minHeight: 56),
      padding: AppInsets.control,
      decoration: BoxDecoration(
        color: active ? context.colors.brandSubtle : context.colors.surface,
        border: Border.all(
          color: active ? context.colors.brand : context.colors.line,
        ),
        borderRadius: AppRadius.rMd,
      ),
      child: Column(
        children: [
          PrototypeIcon(
            icon,
            size: 19,
            color: active ? context.colors.brand : context.colors.textMuted,
          ),
          const SizedBox(height: 5),
          Text(
            label,
            style: TextStyle(
              fontSize: AppType.micro,
              color: active ? context.colors.brand : context.colors.textMuted,
            ),
          ),
        ],
      ),
    ),
  );
}
