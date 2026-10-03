import 'package:fullstack_reader/app/theme/app_theme.dart';

import '../shared/prototype_icons.dart';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/article_page.dart';
import '../features/auth_page.dart';

import 'package:fullstack_reader/features/discovery/author_page.dart';
import 'package:fullstack_reader/features/discovery/browse_page.dart';
import 'package:fullstack_reader/features/discovery/categories_page.dart';
import 'package:fullstack_reader/features/discovery/home_page.dart';
import 'package:fullstack_reader/features/discovery/search_page.dart';
import 'package:fullstack_reader/features/discovery/tags_page.dart';

import '../features/editor.dart';

import 'package:fullstack_reader/features/member/member_articles_page.dart';
import 'package:fullstack_reader/features/member/member_list_page.dart';
import 'package:fullstack_reader/features/member/member_page.dart';
import 'package:fullstack_reader/features/member/notifications_page.dart';
import 'package:fullstack_reader/features/member/profile_page.dart';
import 'package:fullstack_reader/features/member/settings_page.dart';
import 'package:fullstack_reader/shared/widgets/page_frame.dart';
import 'package:fullstack_reader/shared/widgets/reader_context.dart';
import 'package:fullstack_reader/shared/widgets/state_message.dart';

import 'session.dart';

part 'app_bottom_bar.dart';

/// 以会话代际重建受保护页面，防止旧账号的页面状态跨账号复用。
class AccountBoundary extends ConsumerWidget {
  const AccountBoundary({
    super.key,
    required this.child,
    this.authenticated = true,
  });
  final Widget child;
  final bool authenticated;
  @override
  Widget build(BuildContext context, WidgetRef ref) =>
      authenticated && ref.watch(sessionProvider).user == null
      ? const SizedBox.shrink()
      : KeyedSubtree(
          key: ValueKey(ref.watch(sessionProvider).epoch),
          child: child,
        );
}

GoRouter createRouter(AppSession session) => GoRouter(
  refreshListenable: session,
  redirect: (context, state) => _redirect(session, state),
  errorBuilder: _errorBuilder,
  routes: [
    GoRoute(
      path: '/restoring',
      builder: (c, s) =>
          const Scaffold(body: Center(child: CircularProgressIndicator())),
    ),
    StatefulShellRoute.indexedStack(
      builder: (c, s, shell) => Scaffold(
        body: shell,
        bottomNavigationBar: _AppBottomBar(shell: shell),
      ),
      branches: _shellBranches(),
    ),
    ..._standaloneRoutes(),
  ],
);

// 受保护入口等待会话恢复，原始位置作为登录后的回跳目标。
String? _redirect(AppSession session, GoRouterState state) {
  final private =
      state.uri.path.startsWith('/member/') &&
      state.uri.path != '/member/settings';
  if (private && session.user == null) {
    if (session.restoring) {
      return '/restoring?from=${Uri.encodeComponent(state.uri.toString())}';
    }
    return '/login?from=${Uri.encodeComponent(state.uri.toString())}';
  }
  if (state.uri.path == '/restoring' && !session.restoring) {
    return state.uri.queryParameters['from'] ?? '/member';
  }
  return null;
}

Widget _errorBuilder(BuildContext c, GoRouterState s) => PageFrame(
  title: '页面不存在',
  child: StateMessage(
    title: '没有找到这个页面',
    description: '请返回首页继续阅读',
    onRetry: () => c.go('/'),
  ),
);

// 每个 Router 创建自己的导航分支，避免跨实例共享 Navigator key。
List<StatefulShellBranch> _shellBranches() => [
  StatefulShellBranch(
    routes: [GoRoute(path: '/', builder: (c, s) => const HomePage())],
  ),
  StatefulShellBranch(
    routes: [
      GoRoute(path: '/categories', builder: (c, s) => const CategoriesPage()),
      GoRoute(path: '/tags', builder: (c, s) => const TagsPage()),
      GoRoute(
        path: '/browse',
        builder: (c, s) => BrowsePage(
          title: s.uri.queryParameters['title'] ?? '文章',
          query: {
            for (final k in ['category', 'tag'])
              if (s.uri.queryParameters[k] != null) k: s.uri.queryParameters[k],
          },
        ),
      ),
    ],
  ),
  StatefulShellBranch(
    routes: [
      GoRoute(
        path: '/search',
        builder: (c, s) =>
            SearchPage(initial: s.uri.queryParameters['q'] ?? ''),
      ),
    ],
  ),
  StatefulShellBranch(
    routes: [GoRoute(path: '/member', builder: (c, s) => const MemberPage())],
  ),
];

// 详情和会员操作位于主导航栈之外，返回时保留原分支状态。
List<RouteBase> _standaloneRoutes() => [
  GoRoute(path: '/member/settings', builder: (c, s) => const SettingsPage()),
  GoRoute(
    path: '/articles/:id',
    builder: (c, s) => AccountBoundary(
      authenticated: false,
      child: ArticlePage(
        s.pathParameters['id']!,
        key: ValueKey(s.pathParameters['id']),
      ),
    ),
  ),
  GoRoute(
    path: '/members/:id',
    builder: (c, s) => AuthorPage(s.pathParameters['id']!),
  ),
  GoRoute(
    path: '/login',
    builder: (c, s) =>
        AuthPage(from: s.uri.queryParameters['from'] ?? '/member'),
  ),
  GoRoute(
    path: '/register',
    builder: (c, s) => AuthPage(
      register: true,
      from: s.uri.queryParameters['from'] ?? '/member',
    ),
  ),
  GoRoute(
    path: '/member/articles',
    builder: (c, s) => const AccountBoundary(child: MemberArticlesPage()),
  ),
  GoRoute(
    path: '/member/articles/new',
    builder: (c, s) => const AccountBoundary(child: EditorPage()),
  ),
  GoRoute(
    path: '/member/articles/:id/edit',
    builder: (c, s) =>
        AccountBoundary(child: EditorPage(id: s.pathParameters['id'])),
  ),
  GoRoute(
    path: '/member/articles/:id/preview',
    builder: (c, s) => AccountBoundary(
      child: ArticlePage(s.pathParameters['id']!, preview: true),
    ),
  ),
  GoRoute(
    path: '/member/profile',
    builder: (c, s) => const AccountBoundary(child: ProfilePage()),
  ),
  GoRoute(
    path: '/member/password',
    builder: (c, s) =>
        const AccountBoundary(child: ProfilePage(passwordMode: true)),
  ),
  GoRoute(
    path: '/member/notifications',
    builder: (c, s) => const AccountBoundary(child: NotificationsPage()),
  ),
  for (final kind in ['favorites', 'likes', 'history'])
    GoRoute(
      path: '/member/$kind',
      builder: (c, s) => AccountBoundary(child: MemberListPage(kind)),
    ),
];
