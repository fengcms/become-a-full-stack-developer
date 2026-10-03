import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:fullstack_reader/main.dart' as app;
import 'package:fullstack_reader/core/network/api_client.dart';
import 'package:fullstack_reader/features/repository.dart';

class AnonymousVault implements TokenVault {
  @override
  Future<String?> read() async => null;
  @override
  Future<void> write(String? token) async {}
}

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('production HTTPS public contract and prototype pages', (
    tester,
  ) async {
    const base = String.fromEnvironment(
      'API_BASE_URL',
      defaultValue: 'https://api-befull.kao9.com/api/v1',
    );
    expect(base, 'https://api-befull.kao9.com/api/v1');
    final api = ApiClient(baseUrl: base, vault: AnonymousVault());
    final repo = ReaderRepository(api);
    final articles = await repo.articles(query: {'pageSize': 4});
    expect(articles.items, isNotEmpty);
    final article = await repo.article(articles.items.first.route);
    expect(article.content, isNotEmpty);
    expect(await repo.categories(), isNotEmpty);
    expect(await repo.tags(), isNotEmpty);
    expect(await repo.toc(article.id), isNotEmpty);
    final search = await repo.articles(
      path: '/search',
      query: {'q': 'Next', 'type': 'article'},
    );
    expect(search.items, isNotEmpty);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt('themeMode', ThemeMode.light.index);
    await app.main();
    Future<void> ready(Finder f) async {
      for (var i = 0; i < 150; i++) {
        await tester.pump(const Duration(milliseconds: 200));
        if (f.evaluate().isNotEmpty) return;
        if (i == 80 && find.text('重新加载').evaluate().isNotEmpty) {
          await tester.tap(find.text('重新加载').first);
        }
      }
      debugPrint(
        'Visible text at failure: ${find.byType(Text).evaluate().map((e) => (e.widget as Text).data).whereType<String>().join(" | ")}',
      );
      expect(f, findsWidgets);
    }

    Future<void> tap(Finder f) async {
      await ready(f);
      await tester.ensureVisible(f.first);
      await tester.tap(f.first);
      await tester.pumpAndSettle();
    }

    await ready(find.text('焦点阅读'));
    await tester.pumpAndSettle();
    await binding.convertFlutterSurfaceToImage();
    await tester.pumpAndSettle();
    Future<void> shot(String name) async {
      final bytes = await binding.takeScreenshot(name);
      await File('${Directory.systemTemp.path}/$name.png').writeAsBytes(bytes);
    }

    await shot('prototype-home-light');
    await tap(find.text('分类').last);
    await ready(find.text('按学习路径划分，父分类包含全部后代分类的文章。'));
    await tester.pumpAndSettle();
    await shot('prototype-categories');
    await tap(find.text('搜索').last);
    await tester.pumpAndSettle();
    await ready(find.byType(ActionChip));
    await tester.pumpAndSettle();
    await shot('prototype-search');
    await tap(find.text('我的').last);
    await tap(find.byTooltip('设置'));
    await shot('prototype-settings');
    await tap(find.text('深色'));
    await tap(find.byType(BackButton));
    await tap(find.text('首页').last);
    await shot('prototype-home-dark');
    await tap(find.text(article.title).last);
    await ready(find.byTooltip('目录'));
    await tester.pumpAndSettle();
    await shot('prototype-article-dark');
    expect(tester.takeException(), isNull);
  });
}
