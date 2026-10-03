import 'dart:io';

import 'package:dio/dio.dart';
import 'package:dio/io.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:fullstack_reader/core/cache/blob_store.dart';
import 'package:fullstack_reader/core/cache/data_cache.dart';
import 'package:fullstack_reader/core/network/api_client.dart';
import 'package:fullstack_reader/features/repository.dart';
import 'package:fullstack_reader/app/session.dart';
import 'package:fullstack_reader/main.dart';

class EmptyVault implements TokenVault {
  @override
  Future<String?> read() async => null;
  @override
  Future<void> write(String? token) async {}
}

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets(
    'production read-only cache: memory, restart disk, offline and navigation',
    (tester) async {
      final root = Directory(
        '${(await getTemporaryDirectory()).path}/cache-acceptance-${DateTime.now().millisecondsSinceEpoch}',
      );
      addTearDown(() => root.delete(recursive: true));
      BlobStore store() =>
          BlobStore('acceptance', directory: root, maxBytes: 30 * 1024 * 1024);
      var now = DateTime.now();
      final cache = DataCache(disk: store(), clock: () => now);
      final transport = Dio();
      const proxy = String.fromEnvironment('DEV_HTTP_PROXY');
      if (proxy.isNotEmpty) {
        transport.httpClientAdapter = IOHttpClientAdapter(
          createHttpClient: () =>
              HttpClient()..findProxy = (_) => 'PROXY $proxy',
        );
      }
      final api = ApiClient(
        baseUrl: 'https://api-befull.kao9.com/api/v1',
        vault: EmptyVault(),
      );
      int requests = 0;
      bool offline = false;
      api.dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (o, h) {
            requests++;
            if (offline) {
              h.reject(
                DioException(
                  requestOptions: o,
                  type: DioExceptionType.connectionError,
                ),
              );
            } else {
              h.next(o);
            }
          },
        ),
      );
      final repo = ReaderRepository(api, cache: cache);
      final timer = Stopwatch()..start();
      await repo.categories();
      await repo.tags();
      final list = await repo.articles();
      final article = await repo.article(list.items.first.route);
      expect(article.content, isNotEmpty);
      final firstMs = timer.elapsedMilliseconds, firstRequests = requests;
      timer
        ..reset()
        ..start();
      await repo.categories();
      await repo.tags();
      await repo.articles();
      await repo.article(list.items.first.route);
      final memoryMs = timer.elapsedMilliseconds;
      expect(requests, firstRequests);
      await cache.disk.size();
      final freshCache = DataCache(disk: store(), clock: () => now);
      final restarted = ReaderRepository(api, cache: freshCache);
      timer
        ..reset()
        ..start();
      await restarted.categories();
      await restarted.tags();
      await restarted.articles();
      await restarted.article(list.items.first.id.toString());
      final diskMs = timer.elapsedMilliseconds;
      expect(requests, firstRequests);
      offline = true;
      now = now.add(const Duration(minutes: 31));
      final failed = freshCache.events.firstWhere((e) => e.kind == 'failed');
      expect(await restarted.categories(), isNotEmpty);
      await failed;
      await expectLater(
        restarted.force(restarted.categories),
        throwsA(isA<ApiFailure>()),
      );
      expect(freshCache.peek(restarted.key('/categories/tree', {})), isNotNull);
      offline = false;
      now = DateTime.now();
      final preferences = await SharedPreferences.getInstance();
      final session = AppSession(api, preferences, cache: freshCache)
        ..restoring = false;
      await tester.pumpWidget(
        ProviderScope(
          overrides: [sessionProvider.overrideWith((ref) => session)],
          child: const ReaderApp(),
        ),
      );
      Future<void> ready(Finder f) async {
        for (int i = 0; i < 150 && f.evaluate().isEmpty; i++) {
          await tester.pump(const Duration(milliseconds: 200));
        }
        expect(f, findsWidgets);
      }

      await ready(find.text('焦点阅读'));
      await tester.tap(find.text('分类').last);
      await ready(find.text('按学习路径划分，父分类包含全部后代分类的文章。'));
      // Wait until counts have arrived before measuring tab revisits.
      for (int i = 0; i < 10; i++) {
        await tester.pump(const Duration(milliseconds: 200));
      }
      final beforeTab = requests;
      await tester.tap(find.text('我的').last);
      await tester.pumpAndSettle();
      await tester.tap(find.text('分类').last);
      await tester.pumpAndSettle();
      expect(requests, beforeTab);
      expect(tester.takeException(), isNull);
      binding.reportData = {
        'mode': 'profile',
        'environment': 'production public read-only',
        'initialRequests': firstRequests,
        'initialSequenceMs': firstMs,
        'memorySequenceMs': memoryMs,
        'restartDiskSequenceMs': diskMs,
        'repeatSequenceAdditionalRequests': 0,
        'tabRevisitAdditionalRequests': requests - beforeTab,
        'memoryMetrics': cache.metrics,
        'restartMetrics': freshCache.metrics,
        'offlineStaleAndForcedFailure': 'passed',
      };
      await tester.pumpWidget(const SizedBox());
      await freshCache.clear();
      cache.close();
      freshCache.close();
    },
  );
}
