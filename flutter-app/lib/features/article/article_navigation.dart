part of '../article_page.dart';

/// 目录、分享和更多菜单只负责展示；不会触发文章或互动数据的重载。
class _ArticleNavigation {
  const _ArticleNavigation(this.context, this.article, this.toc, this.keys);
  final BuildContext context;
  final Article? article;
  final List<ApiTocItem> toc;
  final Map<String, GlobalKey> keys;
  Future<void> directory() async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (c) => SafeArea(
        child: SizedBox(
          height: MediaQuery.sizeOf(c).height * .6,
          child: Column(
            children: [
              Text('文章目录', style: c.text.titleLarge),
              Expanded(
                child: ListView(
                  children: [
                    for (final t in toc)
                      ListTile(
                        contentPadding: EdgeInsets.only(
                          left:
                              AppSpacing.page +
                              ((t.level ?? 1) - 1) * AppSpacing.s3,
                          right: AppSpacing.page,
                        ),
                        title: Text(t.text ?? ''),
                        enabled: keys[t.anchor]?.currentContext != null,
                        onTap: () {
                          Navigator.pop(c);
                          final target = keys[t.anchor]?.currentContext;
                          if (target != null) {
                            Scrollable.ensureVisible(
                              target,
                              duration: MediaQuery.disableAnimationsOf(context)
                                  ? Duration.zero
                                  : const Duration(milliseconds: 250),
                              alignment: .05,
                            );
                          }
                        },
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> shareArticle() async {
    if (article == null) return;
    try {
      const site = String.fromEnvironment('SITE_URL', defaultValue: '');
      await SharePlus.instance.share(
        ShareParams(
          text: site.isEmpty
              ? '${article!.title}\n${article!.data.summary ?? ""}'
              : '${article!.title}\n$site/articles/${article!.route}',
        ),
      );
    } catch (e) {
      if (context.mounted) notice(context, '分享未完成');
    }
  }

  Future<void> moreActions() => showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    builder: (c) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('文章操作', style: context.text.titleMedium),
          MenuCell(
            '分享文章',
            'share',
            onTap: () {
              Navigator.pop(c);
              shareArticle();
            },
          ),
          MenuCell(
            '作者主页',
            'user',
            onTap: () {
              Navigator.pop(c);
              context.push('/members/${article?.data.authorId}');
            },
          ),
        ],
      ),
    ),
  );
  List<Widget> toolbarActions({
    required bool preview,
    required VoidCallback refresh,
  }) => [
    if (!preview)
      IconButton(
        tooltip: '刷新文章',
        onPressed: refresh,
        icon: const PrototypeIcon('refresh', size: 20),
      ),
    if (!preview && toc.isNotEmpty)
      IconButton(
        tooltip: '目录',
        onPressed: directory,
        icon: const ReaderIcon(Icons.format_list_bulleted),
      ),
    if (article != null && !preview)
      IconButton(
        tooltip: '更多',
        onPressed: moreActions,
        icon: const PrototypeIcon('more'),
      ),
  ];
  // 评论入口和目录同属页内定位，不参与正文加载或缓存状态。
  void openComment(GlobalKey commentKey) {
    final target = commentKey.currentContext;
    if (target != null) {
      Scrollable.ensureVisible(
        target,
        duration: const Duration(milliseconds: 250),
        alignment: 1,
      );
    }
  }
}
