part of 'notifications_page.dart';

/// 通知标题、正文和时间保留原型层级，未读标记不单独维护状态。
class _NotificationText extends StatelessWidget {
  const _NotificationText({required this.n});
  final ApiNotification n;
  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                n.title ?? '通知',
                style: const TextStyle(
                  fontSize: AppType.label,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            if (n.isRead != true)
              Container(
                width: 6,
                height: 6,
                decoration: BoxDecoration(
                  color: context.colors.danger,
                  shape: BoxShape.circle,
                ),
              ),
          ],
        ),
        const SizedBox(height: 5),
        Text(
          n.body ?? '',
          style: TextStyle(
            fontSize: AppType.caption,
            height: 1.7,
            color: context.colors.textMuted,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          n.createdAt?.split('T').first ?? '',
          style: context.text.labelSmall,
        ),
      ],
    );
  }
}
