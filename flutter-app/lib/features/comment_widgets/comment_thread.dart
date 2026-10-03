part of '../comments.dart';

/// 评论楼层组件保持原型的缩进和引用样式，业务操作通过回调交还页面。
class _CommentThread extends StatelessWidget {
  const _CommentThread({
    required this.id,
    required this.comments,
    required this.items,
    required this.expanded,
    required this.onExpand,
    required this.userId,
    required this.onReply,
    required this.onRemove,
  });
  final int id;
  final List<ApiComment> comments;
  final List<ApiComment> items;
  final bool expanded;
  final VoidCallback onExpand;
  final int? userId;
  final ValueChanged<ApiComment> onReply;
  final ValueChanged<ApiComment> onRemove;
  @override
  Widget build(BuildContext context) {
    final root = comments.where((c) => c.id == id).firstOrNull;
    final replies = comments.where((c) => c.id != id).toList();
    final shown = expanded ? replies : replies.take(3);
    return Container(
      key: ValueKey('comment-thread-$id'),
      padding: AppInsets.sectionVertical,
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: context.colors.line)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CircleAvatar(
            radius: 14,
            backgroundColor: context.colors.brandSubtle,
            foregroundColor: context.colors.brandOnSubtle,
            child: Text(
              (root?.userName?.isNotEmpty == true ? root!.userName! : '会员')
                  .characters
                  .first,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  root == null ? '原评论暂不可见' : root.userName ?? '会员',
                  style: TextStyle(
                    fontSize: AppType.caption,
                    fontWeight: FontWeight.w600,
                    color: context.colors.textBody,
                  ),
                ),
                if (root != null) ...[
                  Padding(
                    padding: AppInsets.replyQuote,
                    child: SelectableText(
                      root.content ?? '',
                      style: TextStyle(
                        fontSize: AppType.adjacentTitle,
                        height: 1.75,
                        color: context.colors.textBody,
                      ),
                    ),
                  ),
                  _CommentFooter(
                    c: root,
                    userId: userId,
                    onReply: onReply,
                    onRemove: onRemove,
                  ),
                ],
                for (final c in shown)
                  _CommentReply(
                    c: c,
                    items: items,
                    userId: userId,
                    onReply: onReply,
                    onRemove: onRemove,
                  ),
                if (replies.length > 3)
                  TextButton(
                    onPressed: onExpand,
                    child: Text(
                      expanded ? '收起回复' : '展开 ${replies.length - 3} 条回复',
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
