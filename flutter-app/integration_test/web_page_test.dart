import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:fullstack_reader/app/theme/app_theme.dart';
import 'package:fullstack_reader/core/markdown/reader_markdown.dart';
import 'package:fullstack_reader/features/web_page.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets(
    'article links stay inside app; page history never intercepts close or back',
    (tester) async {
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      addTearDown(() => server.close(force: true));
      const longTitle = '这是网页内部跳转后的长标题，用来验证标题居中以及超出标题栏时显示省略号';
      server.listen((request) async {
        request.response.headers.contentType = ContentType.html;
        request.response.write(
          request.uri.path == '/second'
              ? '<html><head><title>$longTitle</title><meta name="viewport" content="width=device-width"></head><body>第二页</body></html>'
              : '<html><head><title>第一页</title></head><body>第一页<script>setTimeout(()=>location.href="/second",500)</script></body></html>',
        );
        await request.response.close();
      });
      final url = 'http://127.0.0.1:${server.port}/first';
      await tester.pumpWidget(
        MaterialApp(
          theme: buildAppTheme(Brightness.light),
          home: Scaffold(
            appBar: AppBar(title: const Text('原文章页面')),
            body: ReaderMarkdown('[打开网页]($url)'),
          ),
        ),
      );
      Future<void> ready(Finder finder) async {
        for (var i = 0; i < 100 && finder.evaluate().isEmpty; i++) {
          await tester.pump(const Duration(milliseconds: 200));
        }
        expect(finder, findsOneWidget);
      }

      Future<void> open() async {
        await tester.tap(find.text('打开网页'));
        await ready(find.byType(WebPage));
        await ready(find.text(longTitle));
        final title = tester.widget<Text>(find.text(longTitle));
        expect(title.maxLines, 1);
        expect(title.overflow, TextOverflow.ellipsis);
        expect(tester.takeException(), isNull);
      }

      await open();
      await tester.tap(find.byTooltip('返回'));
      await tester.pumpAndSettle();
      expect(find.text('原文章页面'), findsOneWidget);
      expect(find.byType(WebPage), findsNothing);
      await open();
      await tester.tap(find.byTooltip('网页菜单'));
      await tester.pumpAndSettle();
      expect(find.text('在系统浏览器打开'), findsOneWidget);
      await tester.tap(find.text('关闭网页'));
      await tester.pumpAndSettle();
      expect(find.text('原文章页面'), findsOneWidget);
      expect(find.byType(WebPage), findsNothing);
      await open();
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      expect(find.byType(WebPage), findsNothing);
      expect(find.text('原文章页面'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    },
  );
}
