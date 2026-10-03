import 'package:fullstack_reader/shared/widgets/article_feed.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:fullstack_reader/app/router.dart';
import 'package:fullstack_reader/app/session.dart';
import 'package:fullstack_reader/app/theme/app_theme.dart';
import 'package:fullstack_reader/core/cache/blob_store.dart';
import 'package:fullstack_reader/core/cache/data_cache.dart';
import 'package:fullstack_reader/core/network/api_client.dart';
import 'package:fullstack_reader/features/discovery/focus_stories.dart';
import 'package:fullstack_reader/features/repository.dart';

import 'widget_test.dart' show Adapter, MemoryVault, client, envelope;

void main() {
  for (final path in ['/articles', '/me/articles']) {
    testWidgets(
      'feed $path handles changed first page without mixing results',
      (tester) async {
        SharedPreferences.setMockInitialValues({});
        Map<String, dynamic> page(String title) => {
          'list': [
            {'id': 1, 'title': title, 'status': 'published'},
          ],
          'pagination': {'page': 1, 'totalPages': 1, 'total': 1},
        };
        final cache = DataCache(
          disk: BlobStore('r3-feed', maxBytes: 1, enabled: false),
        );
        final api = client(
          Adapter((_) => envelope(page('原文章'))),
          MemoryVault(),
        );
        final session = AppSession(
          api,
          await SharedPreferences.getInstance(),
          cache: cache,
        );
        final container = ProviderContainer(
          overrides: [sessionProvider.overrideWith((ref) => session)],
        );
        final repo = container.read(repositoryProvider);
        await tester.pumpWidget(
          UncontrolledProviderScope(
            container: container,
            child: MaterialApp(
              theme: buildAppTheme(Brightness.light),
              home: Scaffold(body: ArticleFeed(path: path)),
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(find.text('原文章'), findsOneWidget);
        final key = repo.key(path, {
          'page': 1,
          'pageSize': 12,
        }, private: path.startsWith('/me/'));
        cache.seed(
          key,
          page('更新文章'),
          repo.policy(path)!,
          repo.resourceTags(path),
        );
        cache.emit(CacheEvent(key, 'updated'));
        await tester.pumpAndSettle();
        if (path.startsWith('/me/')) {
          expect(find.text('更新文章'), findsOneWidget);
          expect(find.text('原文章'), findsNothing);
          expect(find.text('有新内容，点击更新'), findsNothing);
        } else {
          expect(find.text('原文章'), findsOneWidget);
          expect(find.text('更新文章'), findsNothing);
          expect(find.text('有新内容，点击更新'), findsOneWidget);
        }
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox());
        container.dispose();
        cache.close();
      },
    );
  }

  test(
    'decoded field errors preserve status, fields and retry metadata',
    () async {
      final api = client(
        Adapter(
          (_) => envelope(
            {
              'errors': [
                {'field': 'email', 'message': '邮箱已被使用'},
              ],
            },
            code: 4001,
            status: 422,
            headers: {
              'retry-after': ['7'],
            },
          ),
        ),
        MemoryVault(),
      );
      await expectLater(
        api.request('/me/profile', method: 'PATCH'),
        throwsA(
          isA<ApiFailure>()
              .having((e) => e.fields, 'fields', {'email': '邮箱已被使用'})
              .having((e) => e.message, 'message', '邮箱已被使用')
              .having((e) => e.status, 'status', 422)
              .having((e) => e.retryAfter, 'retryAfter', 7),
        ),
      );
    },
  );

  test(
    'anonymous expiry never refreshes; long cooldown never retries',
    () async {
      final paths = <String>[];
      final api = client(
        Adapter((o) {
          paths.add(o.path);
          return o.path == '/expired'
              ? envelope(null, code: 1002, status: 401)
              : envelope(
                  null,
                  code: 5001,
                  status: 429,
                  headers: {
                    'retry-after': ['4'],
                  },
                );
        }),
        MemoryVault(),
      );
      await expectLater(
        api.request('/expired', anonymous: true),
        throwsA(isA<ApiFailure>()),
      );
      await expectLater(api.request('/limited'), throwsA(isA<ApiFailure>()));
      expect(paths, ['/expired', '/limited']);
    },
  );

  testWidgets('carousel arrows keep page indicator and visible story in sync', (
    tester,
  ) async {
    final items = List.generate(
      3,
      (i) => Article.fromJson({
        'id': i + 1,
        'title': '焦点 ${i + 1}',
        'summary': '摘要',
        'status': 'published',
      }),
    );
    await tester.pumpWidget(
      MaterialApp(
        theme: buildAppTheme(Brightness.light),
        home: Scaffold(body: FocusStories(items)),
      ),
    );
    expect(find.text('1 / 3'), findsOneWidget);
    await tester.tap(find.byTooltip('下一条焦点'));
    await tester.pumpAndSettle();
    expect(find.text('2 / 3'), findsOneWidget);
    expect(find.text('焦点 2').hitTestable(), findsOneWidget);
    await tester.tap(find.byTooltip('上一条焦点'));
    await tester.pumpAndSettle();
    expect(find.text('1 / 3'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'router waits for restore then preserves private destination; settings stays public',
    (tester) async {
      SharedPreferences.setMockInitialValues({});
      final cache = DataCache(
        disk: BlobStore('r3', maxBytes: 1, enabled: false),
      );
      final session = AppSession(
        client(
          Adapter(
            (_) => envelope({
              'list': [],
              'pagination': {'page': 1, 'totalPages': 0, 'total': 0},
            }),
          ),
          MemoryVault()..token = null,
        ),
        await SharedPreferences.getInstance(),
        cache: cache,
      );
      final router = createRouter(session);
      router.go('/member/profile');
      await tester.pumpWidget(
        ProviderScope(
          overrides: [sessionProvider.overrideWith((ref) => session)],
          child: MaterialApp.router(
            theme: buildAppTheme(Brightness.light),
            routerConfig: router,
          ),
        ),
      );
      await tester.pump();
      expect(router.routeInformationProvider.value.uri.path, '/restoring');
      await session.restore();
      await tester.pumpAndSettle();
      final uri = router.routeInformationProvider.value.uri;
      expect(uri.path, '/login');
      expect(uri.queryParameters['from'], '/member/profile');
      router.go('/member/settings');
      await tester.pumpAndSettle();
      expect(
        router.routeInformationProvider.value.uri.path,
        '/member/settings',
      );
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
      router.dispose();
      cache.close();
    },
  );
}
