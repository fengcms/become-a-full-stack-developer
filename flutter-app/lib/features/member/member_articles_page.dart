import 'package:fullstack_reader/core/network/endpoints.dart';
import 'package:fullstack_reader/app/theme/app_theme.dart';

import 'dart:async';

import 'package:fullstack_reader/shared/prototype_icons.dart';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:fullstack_reader/app/session.dart';
import 'package:fullstack_reader/shared/widgets/article_feed.dart';
import 'package:fullstack_reader/shared/widgets/page_frame.dart';

import 'package:fullstack_reader/features/member/draft_tile.dart';

/// 稿件列表按状态筛选，编辑返回后刷新受影响的数据。
class MemberArticlesPage extends ConsumerStatefulWidget {
  const MemberArticlesPage({super.key});
  @override
  ConsumerState<MemberArticlesPage> createState() => _MemberArticlesPageState();
}

class _MemberArticlesPageState extends ConsumerState<MemberArticlesPage> {
  String status = '';
  int revision = 0;
  Future<void> edit(String route) async {
    await context.push(route);
    // Repository mutation events refresh only when something actually changed.
  }

  @override
  Widget build(BuildContext context) => PageFrame(
    title: '我的文章',
    actions: [
      IconButton(
        tooltip: '写文章',
        onPressed: () => edit('/member/articles/new'),
        icon: const ReaderIcon(Icons.add),
      ),
    ],
    child: Column(
      children: [
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: AppInsets.compact,
          child: Row(
            children: [
              for (final e in {
                '': '全部',
                'draft': '草稿',
                'pending': '待审核',
                'published': '已发布',
              }.entries)
                Padding(
                  padding: AppInsets.inlineRight,
                  child: ChoiceChip(
                    label: Text(e.value),
                    selected: status == e.key,
                    onSelected: (_) => setState(() => status = e.key),
                  ),
                ),
            ],
          ),
        ),
        Expanded(
          child: ArticleFeed(
            key: ValueKey(
              '$status-$revision-${ref.watch(sessionProvider).epoch}',
            ),
            path: Endpoints.meArticles,
            query: {if (status.isNotEmpty) 'status': status},
            showStatus: true,
            onArticle: (a) => edit('/member/articles/${a.id}/edit'),
            itemBuilder: (a, reload) => DraftTile(
              a,
              onEdit: () => edit('/member/articles/${a.id}/edit'),
              reload: reload,
            ),
          ),
        ),
      ],
    ),
  );
}
