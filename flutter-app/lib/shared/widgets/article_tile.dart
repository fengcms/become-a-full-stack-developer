import 'package:fullstack_reader/app/theme/app_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:fullstack_reader/app/session.dart';
import 'package:fullstack_reader/features/data/reader_models.dart';

import 'package:fullstack_reader/shared/widgets/reader_context.dart';
import 'package:fullstack_reader/shared/widgets/reader_image.dart';
import 'package:fullstack_reader/shared/widgets/status_badge.dart';

part 'article_tile_content.dart';

/// 文章摘要卡片复用统一阅读样式，封面遵循文章公开状态的缓存权限。
class ArticleTile extends ConsumerWidget {
  const ArticleTile(
    this.article, {
    super.key,
    this.onTap,
    this.trailing,
    this.showStatus = false,
  });
  final Article article;
  final VoidCallback? onTap;
  final Widget? trailing;
  final bool showStatus;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.watch(reactionRevisionProvider);
    final d = article.data;
    return InkWell(
      onTap: onTap ?? () => context.push('/articles/${article.route}'),
      child: Container(
        padding: AppInsets.page,
        decoration: BoxDecoration(
          border: Border(bottom: BorderSide(color: context.colors.line)),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: _ArticleTileContent(
                article: article,
                showStatus: showStatus,
              ),
            ),
            if (d.coverImage?.isNotEmpty == true &&
                MediaQuery.sizeOf(context).width > 350) ...[
              const SizedBox(width: 12),
              ClipRRect(
                borderRadius: AppRadius.rXs,
                child: ReaderImage(
                  d.coverImage!,
                  width: 96,
                  height: 72,
                  public: article.status == 'published',
                ),
              ),
            ],
            ?trailing,
          ],
        ),
      ),
    );
  }
}
