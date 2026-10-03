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

const navigationItems = [
  (icon: 'home', label: '首页'),
  (icon: 'layers', label: '分类'),
  (icon: 'search', label: '搜索'),
  (icon: 'user', label: '我的'),
];

GoRouter createRouter(AppSession session) => GoRouter(
  refreshListenable: session,
  redirect: (context, state) {
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
  },
  errorBuilder: (c, s) => PageFrame(
    title: '页面不存在',
    child: StateMessage(
      title: '没有找到这个页面',
      description: '请返回首页继续阅读',
      onRetry: () => c.go('/'),
    ),
  ),
  routes: [
    GoRoute(
      path: '/restoring',
      builder: (c, s) =>
          const Scaffold(body: Center(child: CircularProgressIndicator())),
    ),
    StatefulShellRoute.indexedStack(
      builder: (c, s, shell) => Scaffold(
        body: shell,
        bottomNavigationBar: Container(
          decoration: BoxDecoration(
            color: c.colors.surface,
            border: Border(top: BorderSide(color: c.colors.line)),
          ),
          child: SafeArea(
            top: false,
            child: SizedBox(
              height: 56,
              child: Row(
                children: [
                  for (final (i, item) in navigationItems.indexed)
                    Expanded(
                      child: Semantics(
                        selected: shell.currentIndex == i,
                        button: true,
                        child: InkWell(
                          onTap: () => shell.goBranch(
                            i,
                            initialLocation: i == shell.currentIndex,
                          ),
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              PrototypeIcon(
                                item.icon,
                                size: 22,
                                color: shell.currentIndex == i
                                    ? c.colors.brand
                                    : c.colors.textMuted,
                              ),
                              const SizedBox(height: 3),
                              Text(
                                item.label,
                                style: TextStyle(
                                  fontSize: AppType.navigation,
                                  height: 1.3,
                                  fontWeight: shell.currentIndex == i
                                      ? FontWeight.w600
                                      : FontWeight.w400,
                                  color: shell.currentIndex == i
                                      ? c.colors.brand
                                      : c.colors.textMuted,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
      branches: [
        StatefulShellBranch(
          routes: [GoRoute(path: '/', builder: (c, s) => const HomePage())],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: '/categories',
              builder: (c, s) => const CategoriesPage(),
            ),
            GoRoute(path: '/tags', builder: (c, s) => const TagsPage()),
            GoRoute(
              path: '/browse',
              builder: (c, s) => BrowsePage(
                title: s.uri.queryParameters['title'] ?? '文章',
                query: {
                  for (final k in ['category', 'tag'])
                    if (s.uri.queryParameters[k] != null)
                      k: s.uri.queryParameters[k],
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
          routes: [
            GoRoute(path: '/member', builder: (c, s) => const MemberPage()),
          ],
        ),
      ],
    ),
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
  ],
);
