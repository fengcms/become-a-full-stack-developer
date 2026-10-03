import 'package:fullstack_reader/app/theme/app_theme.dart';
import 'package:fullstack_reader/shared/prototype_icons.dart';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:fullstack_reader/app/session.dart';
import 'package:fullstack_reader/shared/widgets/article_feed.dart';
import 'package:fullstack_reader/shared/widgets/async_pane.dart';
import 'package:fullstack_reader/shared/widgets/page_frame.dart';
import 'package:fullstack_reader/shared/widgets/reader_context.dart';
import 'package:fullstack_reader/shared/widgets/section_title.dart';
import 'package:fullstack_reader/shared/widgets/unread_icon.dart';
import 'package:fullstack_reader/features/data/reader_models.dart';

import 'package:fullstack_reader/features/discovery/focus_stories.dart';

/// 组合焦点、最新与推荐阅读，各模块使用同一仓库的资源缓存。
class HomePage extends ConsumerWidget {
  const HomePage({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) => PageFrame(
    title: '成为全栈',
    titleWidget: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          padding: AppInsets.tinyBadge,
          decoration: BoxDecoration(
            color: context.colors.brandSubtle,
            borderRadius: AppRadius.rXs,
          ),
          child: Text(
            '{ }',
            style: TextStyle(
              fontFamily: 'monospace',
              fontSize: AppType.body,
              fontWeight: FontWeight.w700,
              color: context.colors.brandOnSubtle,
            ),
          ),
        ),
        const SizedBox(width: 8),
        Text(
          '成为全栈',
          style: TextStyle(
            fontSize: AppType.listTitle,
            fontWeight: FontWeight.w700,
            color: context.colors.textTitle,
          ),
        ),
      ],
    ),
    actions: [
      IconButton(
        tooltip: '搜索',
        onPressed: () => context.go('/search'),
        icon: const PrototypeIcon('search'),
      ),
      IconButton(
        tooltip: '通知',
        onPressed: () => context.push('/member/notifications'),
        icon: const UnreadIcon(Icons.notifications_none),
      ),
    ],
    child: ArticleFeed(
      query: const {'pageSize': 4},
      header: Column(
        children: [
          AsyncPane<PageResult<Article>>(
            load: () => ref
                .read(repositoryProvider)
                .articles(query: {'sort': '-publishedAt', 'pageSize': 3}),
            builder: (p, _) =>
                p.items.isEmpty ? const SizedBox() : FocusStories(p.items),
          ),
          SectionTitle(
            '最新文章',
            action: '全部',
            onTap: () => context.go('/categories'),
          ),
        ],
      ),
      interlude: Column(
        children: [
          SectionTitle(
            '热门阅读',
            action: '更多',
            onTap: () => context.push('/tags'),
          ),
          AsyncPane<PageResult<Article>>(
            load: () => ref
                .read(repositoryProvider)
                .articles(query: {'sort': '-viewCount', 'pageSize': 5}),
            builder: (p, _) => Column(
              children: [
                for (var i = 0; i < p.items.length; i++)
                  InkWell(
                    onTap: () => context.push('/articles/${p.items[i].route}'),
                    child: Container(
                      padding: AppInsets.toolbar,
                      decoration: BoxDecoration(
                        border: Border(
                          bottom: BorderSide(color: context.colors.line),
                        ),
                      ),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '${i + 1}'.padLeft(2, '0'),
                            style: TextStyle(
                              fontFamily: 'monospace',
                              fontSize: AppType.label,
                              fontWeight: FontWeight.w700,
                              color: context.colors.brand,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              p.items[i].title,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                fontSize: AppType.label,
                                height: 1.55,
                                color: context.colors.textBody,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            '${p.items[i].data.viewCount ?? 0}',
                            style: context.text.labelSmall,
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 24),
        ],
      ),
    ),
  );
}
