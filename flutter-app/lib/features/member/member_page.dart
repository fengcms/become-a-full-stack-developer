import '../../core/generated/models.dart';

import 'package:fullstack_reader/app/theme/app_theme.dart';
import 'package:fullstack_reader/shared/prototype_icons.dart';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:fullstack_reader/app/session.dart';
import 'package:fullstack_reader/shared/widgets/article_tile.dart';
import 'package:fullstack_reader/shared/widgets/async_pane.dart';
import 'package:fullstack_reader/shared/widgets/cell_group.dart';
import 'package:fullstack_reader/shared/widgets/menu_cell.dart';
import 'package:fullstack_reader/shared/widgets/page_frame.dart';
import 'package:fullstack_reader/shared/widgets/reader_context.dart';
import 'package:fullstack_reader/shared/widgets/reader_image.dart';
import 'package:fullstack_reader/shared/widgets/section_title.dart';
import 'package:fullstack_reader/shared/widgets/unread_icon.dart';
import 'package:fullstack_reader/features/data/reader_models.dart';

part 'member_header.dart';
part 'member_statistics.dart';

/// 游客也可浏览会员入口；登录后加载按字段命名的统计和阅读历史。
class MemberPage extends ConsumerWidget {
  const MemberPage({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider), user = session.user;
    return PageFrame(
      title: '我的',
      actions: [
        IconButton(
          tooltip: '通知',
          onPressed: () => context.push('/member/notifications'),
          icon: const UnreadIcon(Icons.notifications_none),
        ),
        IconButton(
          tooltip: '设置',
          onPressed: () => context.push('/member/settings'),
          icon: const PrototypeIcon('cog'),
        ),
      ],
      child: user == null
          ? _MemberContent(user: user)
          : AsyncPane<Map<String, dynamic>>(
              key: ValueKey(session.epoch),
              load: ref.read(repositoryProvider).overview,
              builder: (data, reload) => RefreshIndicator(
                onRefresh: reload,
                child: _MemberContent(user: user, data: data),
              ),
            ),
    );
  }
}

/// 登录前后复用同一组入口，概览统计失败不会影响页面导航。
class _MemberContent extends StatelessWidget {
  const _MemberContent({required this.user, this.data});
  final ApiUser? user;
  final Map<String, dynamic>? data;
  @override
  Widget build(BuildContext context) => ListView(
    children: [
      _MemberHeader(user: user),
      if (user == null)
        Padding(
          padding: AppInsets.pageHorizontal,
          child: FilledButton(
            onPressed: () => context.push('/login'),
            child: const Text('登录 / 注册'),
          ),
        ),
      if (user != null) _MemberStatistics(data: data),
      CellGroup(
        children: [
          for (final item in [
            ('我的收藏', 'star', 'favorites', '收藏值得重读的文章'),
            ('我的点赞', 'heart', 'likes', '记录喜欢的内容'),
            ('阅读历史', 'clockback', 'history', '继续上次的阅读'),
            ('我的文章', 'pen', 'articles', '草稿与已提交稿件'),
            ('通知', 'bell', 'notifications', '收藏、评论与审核结果'),
          ])
            MenuCell(
              item.$1,
              item.$2,
              subtitle: item.$4,
              onTap: () => context.push('/member/${item.$3}'),
            ),
        ],
      ),
      CellGroup(
        children: [
          MenuCell(
            '个人资料',
            'user',
            subtitle: '头像、昵称与邮箱',
            onTap: () => context.push('/member/profile'),
          ),
          MenuCell(
            '设置',
            'cog',
            subtitle: '外观、账号与退出登录',
            onTap: () => context.push('/member/settings'),
          ),
        ],
      ),
      if (user != null) ...[
        SectionTitle(
          '继续阅读',
          action: '历史',
          onTap: () => context.push('/member/history'),
        ),
        if (data != null && (data!['history'] as List).isEmpty)
          const Padding(
            padding: AppInsets.page,
            child: Text('还没有阅读记录，去首页看看吧。'),
          ),
        if (data != null)
          for (final item in data!['history'])
            ArticleTile(Article.fromJson(jsonMap(item['article']))),
      ],
      CellGroup(
        children: [
          MenuCell(
            '写一篇文章',
            'plus',
            subtitle: '草稿会按账号隔离保存在本机',
            onTap: () => context.push('/member/articles/new'),
          ),
        ],
      ),
      const SizedBox(height: 24),
    ],
  );
}
