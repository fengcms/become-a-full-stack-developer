part of 'notifications_page.dart';

/// 已读背景与未读标记取同一通知对象，点击回调由页面处理乐观更新和跳转。
class _NotificationCard extends StatelessWidget {
  const _NotificationCard({required this.n, required this.onTap});
  final ApiNotification n;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: AppInsets.page,
        decoration: BoxDecoration(
          color: n.isRead == true
              ? context.colors.surface
              : context.colors.brandSubtle,
          border: Border(bottom: BorderSide(color: context.colors.line)),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: context.colors.surface,
                border: Border.all(color: context.colors.line),
                borderRadius: AppRadius.rMd,
              ),
              child: Center(
                child: PrototypeIcon(
                  'bell',
                  size: 16,
                  color: context.colors.brand,
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(child: _NotificationText(n: n)),
          ],
        ),
      ),
    );
  }
}
