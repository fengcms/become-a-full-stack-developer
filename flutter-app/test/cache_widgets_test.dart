import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:fullstack_reader/core/cache/blob_store.dart';
import 'package:fullstack_reader/core/cache/data_cache.dart';
import 'package:fullstack_reader/app/session.dart';
import 'package:fullstack_reader/app/theme/app_theme.dart';
import 'package:fullstack_reader/shared/widgets.dart';

import 'widget_test.dart' show Adapter, MemoryVault, client, envelope;

void main() {
  testWidgets(
    'refresh retains rendered data and 404 evicts without request loops',
    (tester) async {
      SharedPreferences.setMockInitialValues({});
      var calls = 0;
      Completer<ResponseBody>? response;
      final api = client(
        Adapter((o) {
          calls++;
          return response?.future ?? envelope({'copyright': 'old'});
        }),
        MemoryVault(),
      );
      final cache = DataCache(
        disk: BlobStore('none', maxBytes: 1, enabled: false),
      );
      final session = AppSession(
        api,
        await SharedPreferences.getInstance(),
        cache: cache,
      );
      await tester.pumpWidget(
        ProviderScope(
          overrides: [sessionProvider.overrideWith((ref) => session)],
          child: MaterialApp(
            theme: buildAppTheme(Brightness.light),
            home: Scaffold(
              body: AsyncPane<dynamic>(
                load: () => session.repository.read('/site/settings'),
                builder: (data, reload) => Column(
                  children: [
                    Text(data['copyright']),
                    TextButton(onPressed: reload, child: const Text('Refresh')),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('old'), findsOneWidget);
      expect(calls, 1);
      response = Completer<ResponseBody>();
      await tester.tap(find.text('Refresh'));
      await tester.pump();
      expect(find.text('old'), findsOneWidget);
      response.complete(envelope(null, code: 3001, status: 404));
      await tester.pumpAndSettle();
      expect(find.text('old'), findsNothing);
      expect(calls, 2);
      await tester.pump(const Duration(seconds: 5));
      expect(calls, 2);
      await tester.pumpWidget(const SizedBox());
      cache.close();
    },
  );
  testWidgets('returning to article feed reuses data without a new GET', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({});
    var calls = 0;
    final api = client(
      Adapter((o) {
        calls++;
        return envelope({
          'list': [
            {'id': 1, 'title': 'cached article', 'status': 'published'},
          ],
          'pagination': {'page': 1, 'totalPages': 1, 'total': 1},
        });
      }),
      MemoryVault(),
    );
    final cache = DataCache(
      disk: BlobStore('none', maxBytes: 1, enabled: false),
    );
    final session = AppSession(
      api,
      await SharedPreferences.getInstance(),
      cache: cache,
    );
    final nav = GlobalKey<NavigatorState>();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [sessionProvider.overrideWith((ref) => session)],
        child: MaterialApp(
          navigatorKey: nav,
          theme: buildAppTheme(Brightness.light),
          home: Builder(
            builder: (context) => Scaffold(
              body: TextButton(
                onPressed: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const Scaffold(body: ArticleFeed()),
                  ),
                ),
                child: const Text('Open'),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    expect(find.text('cached article'), findsOneWidget);
    expect(calls, 1);
    nav.currentState!.pop();
    await tester.pumpAndSettle();
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    expect(find.text('cached article'), findsOneWidget);
    expect(calls, 1);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    cache.close();
  });
}
