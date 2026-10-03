part of '../comments.dart';

/// 评论楼层组件保持原型的缩进和引用样式，业务操作通过回调交还页面。
class _CommentReply extends StatelessWidget {
  const _CommentReply({
    required this.c,
    required this.items,
    required this.userId,
    required this.onReply,
    required this.onRemove,
  });
  final ApiComment c;
  final List<ApiComment> items;
  final int? userId;
  final ValueChanged<ApiComment> onReply;
  final ValueChanged<ApiComment> onRemove;
  @override
  Widget build(BuildContext context) {
    final parent = items.where((p) => p.id == c.parentId).firstOrNull;
    return Container(
      key: ValueKey('reply-${c.id}'),
      margin: AppInsets.groupTop,
      padding: AppInsets.compact,
      decoration: BoxDecoration(
        color: context.colors.surfaceSunken,
        borderRadius: AppRadius.rSm,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            '回复 ${parent?.userName ?? '原评论暂不可见'}',
            style: TextStyle(
              fontSize: AppType.smallLabel,
              fontWeight: FontWeight.w500,
              color: context.colors.brand,
            ),
          ),
          if (parent != null)
            Container(
              margin: AppInsets.smallTextTop,
              padding: AppInsets.quoteLeft,
              decoration: BoxDecoration(
                border: Border(
                  left: BorderSide(color: context.colors.lineStrong, width: 2),
                ),
              ),
              child: Text(
                parent.content ?? '',
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: AppType.listSummary,
                  height: 1.7,
                  color: context.colors.textMuted,
                ),
              ),
            ),
          Padding(
            padding: AppInsets.replyTop,
            child: SelectableText(
              c.content ?? '',
              style: TextStyle(
                fontSize: AppType.adjacentTitle,
                height: 1.75,
                color: context.colors.textBody,
              ),
            ),
          ),
          _CommentFooter(
            c: c,
            userId: userId,
            onReply: onReply,
            onRemove: onRemove,
          ),
        ],
      ),
    );
  }
}
