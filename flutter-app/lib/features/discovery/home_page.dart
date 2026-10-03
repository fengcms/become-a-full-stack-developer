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

part 'brand_title.dart';
part 'popular_article.dart';
part 'home_latest.dart';
part 'home_popular.dart';

/// 组合焦点、最新与推荐阅读，各模块使用同一仓库的资源缓存。
class HomePage extends ConsumerWidget {
  const HomePage({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) => PageFrame(
    title: '成为全栈',
    titleWidget: _BrandTitle(),
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
      header: _HomeLatest(),
      interlude: _HomePopular(),
    ),
  );
}
