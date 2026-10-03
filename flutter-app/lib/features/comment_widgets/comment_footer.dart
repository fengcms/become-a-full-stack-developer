part of '../comments.dart';

/// 评论楼层组件保持原型的缩进和引用样式，业务操作通过回调交还页面。
class _CommentFooter extends StatelessWidget {
  const _CommentFooter({
    required this.c,
    required this.userId,
    required this.onReply,
    required this.onRemove,
  });
  final ApiComment c;
  final int? userId;
  final ValueChanged<ApiComment> onReply;
  final ValueChanged<ApiComment> onRemove;
  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 20,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        Text(
          c.createdAt?.split('T').first ?? '',
          style: context.text.labelSmall,
        ),
        TextButton(
          style: TextButton.styleFrom(
            minimumSize: const Size(0, 28),
            padding: AppInsets.link,
            foregroundColor: context.colors.textMuted,
            textStyle: const TextStyle(fontSize: AppType.micro),
          ),
          onPressed: () => onReply(c),
          child: const Text('回复'),
        ),
        if (c.userId == userId)
          TextButton(onPressed: () => onRemove(c), child: const Text('删除')),
      ],
    );
  }
}
