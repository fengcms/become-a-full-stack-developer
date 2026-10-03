import 'package:fullstack_reader/core/network/endpoints.dart';
import 'package:fullstack_reader/app/theme/app_theme.dart';
import 'package:fullstack_reader/shared/prototype_icons.dart';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:fullstack_reader/app/session.dart';
import 'package:fullstack_reader/core/generated/models.dart';
import 'package:fullstack_reader/shared/widgets/async_pane.dart';
import 'package:fullstack_reader/shared/widgets/page_frame.dart';
import 'package:fullstack_reader/shared/widgets/page_intro.dart';
import 'package:fullstack_reader/shared/widgets/reader_context.dart';
import 'package:fullstack_reader/shared/widgets/state_message.dart';

/// 栏目树与统计分别读取，栏目导航参数使用应用路由而不是 API 地址。
class CategoriesPage extends ConsumerWidget {
  const CategoriesPage({super.key});
  Widget node(BuildContext context, ApiCategoryNode n, Map<int, int> counts) =>
      n.children.isEmpty
      ? ListTile(
          leading: const SizedBox(width: 15),
          minLeadingWidth: 15,
          horizontalTitleGap: 8,
          contentPadding: AppInsets.pageHorizontal,
          title: Text(n.name ?? ''),
          trailing: Text(
            '${counts[n.id] ?? 0} 篇',
            style: context.text.labelSmall,
          ),
          onTap: () => context.push(
            '/browse?category=${n.slug}&title=${Uri.encodeComponent(n.name ?? '分类文章')}',
          ),
        )
      : ExpansionTile(
          leading: const PrototypeIcon('chevr', size: 15),
          title: Text(n.name ?? ''),
          children: [
            ListTile(
              title: Text('全部${n.name}文章'),
              onTap: () => context.push(
                '/browse?category=${n.slug}&title=${Uri.encodeComponent(n.name ?? '分类文章')}',
              ),
            ),
            for (final child in n.children)
              Padding(
                padding: AppInsets.nestedLeft,
                child: node(context, child, counts),
              ),
          ],
        );
  @override
  Widget build(BuildContext context, WidgetRef ref) => PageFrame(
    title: '分类',
    actions: [
      TextButton(
        onPressed: () => context.push('/tags'),
        child: const PrototypeIcon('tag'),
      ),
    ],
    child: AsyncPane<(List<ApiCategoryNode>, Map<int, int>)>(
      load: () async {
        final categories = await ref.read(repositoryProvider).categories();
        final stats =
            await ref.read(repositoryProvider).read(Endpoints.categoriesStats)
                as List;
        return (
          categories,
          {for (final c in stats) c['id'] as int: c['articleCount'] as int},
        );
      },
      builder: (data, reload) => RefreshIndicator(
        onRefresh: reload,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            const PageIntro('分类', '按学习路径划分，父分类包含全部后代分类的文章。'),
            if (data.$1.isEmpty) const StateMessage(title: '暂无分类'),
            for (final n in data.$1)
              Container(
                decoration: BoxDecoration(
                  border: Border(
                    bottom: BorderSide(color: context.colors.line),
                  ),
                ),
                child: node(context, n, data.$2),
              ),
          ],
        ),
      ),
    ),
  );
}
