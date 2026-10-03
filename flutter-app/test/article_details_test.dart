import 'package:fullstack_reader/core/cache/data_cache.dart';
import 'package:fullstack_reader/core/cache/blob_store.dart';

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:fullstack_reader/app/session.dart';
import 'package:fullstack_reader/app/theme/app_theme.dart';
import 'package:fullstack_reader/core/generated/models.dart';
import 'package:fullstack_reader/core/markdown/reader_markdown.dart';
import 'package:fullstack_reader/features/article_page.dart';

import 'widget_test.dart' show Adapter, MemoryVault, client, envelope;

import 'package:dio/dio.dart';

void main() {
  testWidgets(
    'optimistic reactions, authoritative count, rollback, reply layout and focus',
    (tester) async {
      tester.view.physicalSize = const Size(430, 2200);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      SharedPreferences.setMockInitialValues({});
      var like = Completer<ResponseBody>();
      final favorite = Completer<ResponseBody>();
      var writes = 0;
      final api = client(
        Adapter((o) {
          if (o.path == '/articles/1') {
            return envelope({
              'id': 1,
              'title': '测试文章',
              'authorId': 2,
              'authorName': '作者',
              'status': 'published',
              'likeCount': 5,
              'content': '正文',
            });
          }
          if (o.path.endsWith('/like/status')) {
            return envelope({'liked': false, 'likeCount': 5});
          }
          if (o.path.endsWith('/like')) {
            writes++;
            return like.future;
          }
          if (o.path == '/me/favorites' && o.method == 'POST') {
            return favorite.future;
          }
          if (o.path == '/me/favorites' || o.path.endsWith('/toc')) {
            return envelope([]);
          }
          if (o.path.endsWith('/comments')) {
            return envelope({
              'list': [
                {
                  'id': 1,
                  'userId': 2,
                  'userName': '甲',
                  'content': '主评论',
                  'status': 'approved',
                },
                {
                  'id': 2,
                  'parentId': 1,
                  'userId': 3,
                  'userName': '乙',
                  'content': '子评论',
                  'status': 'approved',
                },
              ],
              'pagination': {'page': 1, 'totalPages': 1, 'total': 2},
            });
          }
          return envelope({});
        }),
        MemoryVault(),
      );
      final session = AppSession(
        api,
        await SharedPreferences.getInstance(),
        cache: DataCache(
          disk: BlobStore('test', maxBytes: 100, enabled: false),
        ),
      )..user = ApiUser.fromJson({'id': 99});
      await tester.pumpWidget(
        ProviderScope(
          overrides: [sessionProvider.overrideWith((ref) => session)],
          child: MaterialApp(
            theme: buildAppTheme(Brightness.light),
            home: const ArticlePage('1'),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('点赞 5'));
      await tester.pump();
      expect(find.text('点赞 6'), findsOneWidget);
      expect(find.textContaining('6 赞'), findsOneWidget);
      await tester.tap(find.text('点赞 6'));
      await tester.pump(const Duration(milliseconds: 50));
      expect(writes, 1);
      await tester.tap(find.text('收藏'));
      await tester.pump();
      expect(find.text('已收藏'), findsOneWidget);
      like.complete(envelope({'liked': true, 'likeCount': 9}));
      favorite.complete(envelope(null, code: 5000, status: 500));
      await tester.pumpAndSettle();
      expect(find.text('点赞 9'), findsOneWidget);
      expect(find.textContaining('9 赞'), findsOneWidget);
      expect(find.text('收藏'), findsOneWidget);
      like = Completer<ResponseBody>();
      await tester.tap(find.text('点赞 9'));
      await tester.pump();
      expect(find.text('点赞 8'), findsOneWidget);
      like.complete(envelope(null, code: 5000, status: 500));
      await tester.pumpAndSettle();
      expect(find.text('点赞 9'), findsOneWidget);
      final thread = find.byKey(const ValueKey('comment-thread-1'));
      final reply = find.byKey(const ValueKey('reply-2'));
      expect(find.descendant(of: thread, matching: reply), findsOneWidget);
      expect(find.text('回复 甲'), findsOneWidget);
      expect(tester.getTopLeft(reply).dx - tester.getTopLeft(thread).dx, 40);
      final field = find.byType(TextField);
      expect(
        tester.getTopLeft(field).dy - tester.getBottomLeft(thread).dy,
        greaterThanOrEqualTo(24),
      );
      await tester.tap(field);
      await tester.pump();
      expect(
        tester
            .widget<EditableText>(find.byType(EditableText).last)
            .focusNode
            .hasFocus,
        isTrue,
      );
      await tester.tap(find.text('测试文章'));
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<EditableText>(find.byType(EditableText).last)
            .focusNode
            .hasFocus,
        isFalse,
      );
      expect(
        tester
            .widget<Container>(find.byKey(const ValueKey('article-actions')))
            .padding,
        const EdgeInsets.symmetric(vertical: 20),
      );
      await tester.pumpWidget(const SizedBox());
    },
  );
  for (final brightness in Brightness.values) {
    testWidgets('fenced code labels, source and highlighting in $brightness', (
      tester,
    ) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: buildAppTheme(brightness),
          home: const Scaffold(
            body: SingleChildScrollView(
              child: ReaderMarkdown(
                '```dart\nfinal answer = "hello";\n```\n\n```unknown-lang\nplain\n```\n\n```\nunlabelled\n```',
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('dart'), findsOneWidget);
      expect(find.text('unknown-lang'), findsOneWidget);
      expect(find.text('纯文本'), findsOneWidget);
      final code = tester
          .widgetList<SelectableText>(find.byType(SelectableText))
          .firstWhere(
            (w) => w.textSpan?.toPlainText().contains('final answer') ?? false,
          );
      expect(code.textSpan!.toPlainText(), 'final answer = "hello";\n');
      final colors = <Color>{};
      void collect(InlineSpan s) {
        if (s.style?.color != null) colors.add(s.style!.color!);
        if (s is TextSpan) {
          for (final child in s.children ?? <InlineSpan>[]) {
            collect(child);
          }
        }
      }

      collect(code.textSpan!);
      expect(colors.length, greaterThanOrEqualTo(2));
      expect(tester.takeException(), isNull);
    });
  }
}
