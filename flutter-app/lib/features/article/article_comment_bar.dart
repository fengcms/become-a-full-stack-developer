part of '../article_page.dart';

/// 底部评论入口仅负责滚动定位，不重复创建评论编辑状态。
class _ArticleCommentBar extends StatelessWidget {
  const _ArticleCommentBar({required this.openComment});
  final VoidCallback openComment;
  @override
  Widget build(BuildContext context) => SafeArea(
    top: false,
    child: Container(
      padding: AppInsets.control,
      decoration: BoxDecoration(
        color: context.colors.surface,
        border: Border(top: BorderSide(color: context.colors.line)),
      ),
      child: Row(
        children: [
          Expanded(
            child: InkWell(
              onTap: openComment,
              child: Container(
                height: 38,
                padding: AppInsets.pageHorizontal,
                alignment: Alignment.centerLeft,
                decoration: BoxDecoration(
                  color: context.colors.bgSubtle,
                  border: Border.all(color: context.colors.fieldBorder),
                  borderRadius: AppRadius.rFull,
                ),
                child: Text(
                  '写下你的评论…',
                  style: TextStyle(
                    fontSize: AppType.caption,
                    color: context.colors.textPlaceholder,
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(width: 8),
          IconButton(
            tooltip: '发表评论',
            onPressed: openComment,
            style: IconButton.styleFrom(
              backgroundColor: context.colors.brandSolid,
              foregroundColor: Colors.white,
            ),
            icon: const PrototypeIcon('send', size: 17),
          ),
        ],
      ),
    ),
  );
}
