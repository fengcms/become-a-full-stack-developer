part of '../article_page.dart';

/// 互动区域的分隔线与按钮间距固定，避免内容有无标签时贴边。
class _ArticleReactions extends StatelessWidget {
  const _ArticleReactions({
    required this.likes,
    required this.liked,
    required this.favorite,
    required this.likeBusy,
    required this.favoriteBusy,
    required this.interactionReady,
    required this.like,
    required this.bookmark,
    required this.shareArticle,
    required this.loadInteractions,
  });
  final int likes;
  final bool liked;
  final bool favorite;
  final bool likeBusy;
  final bool favoriteBusy;
  final bool interactionReady;
  final VoidCallback like;
  final VoidCallback bookmark;
  final VoidCallback shareArticle;
  final Future<void> Function() loadInteractions;
  @override
  Widget build(BuildContext context) => Container(
    key: const ValueKey('article-actions'),
    margin: AppInsets.sectionTop,
    padding: AppInsets.articleReactions,
    decoration: BoxDecoration(
      border: Border(
        top: BorderSide(color: context.colors.line),
        bottom: BorderSide(color: context.colors.line),
      ),
    ),
    child: Wrap(
      alignment: WrapAlignment.center,
      spacing: 12,
      runSpacing: 12,
      children: [
        _ArticleAction(
          'heart',
          '点赞 $likes',
          (likeBusy || !interactionReady) ? null : like,
          active: liked,
        ),
        _ArticleAction(
          'bookmark',
          favorite ? '已收藏' : '收藏',
          (favoriteBusy || !interactionReady) ? null : bookmark,
          active: favorite,
        ),
        _ArticleAction('share', '分享', shareArticle),
        if (!interactionReady)
          TextButton(
            onPressed: () async {
              try {
                await loadInteractions();
              } catch (e) {
                if (context.mounted) notice(context, e);
              }
            },
            child: const Text('刷新互动状态'),
          ),
      ],
    ),
  );
}
