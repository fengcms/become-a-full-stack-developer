import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:image_picker/image_picker.dart';
import 'package:fullstack_reader/core/network/api_client.dart';
import 'package:fullstack_reader/core/storage/upload.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:integration_test/integration_test.dart';
import 'package:fullstack_reader/main.dart' as app;

Future<void> ready(
  WidgetTester tester,
  Finder target, {
  int seconds = 20,
}) async {
  for (var i = 0; i < seconds * 5; i++) {
    await tester.pump(const Duration(milliseconds: 200));
    if (target.evaluate().isNotEmpty) return;
  }
  expect(target, findsWidgets);
}

Future<void> tap(WidgetTester tester, Finder target) async {
  await ready(tester, target);
  await tester.ensureVisible(target.first);
  await tester.tap(target.first);
  await tester.pumpAndSettle(const Duration(milliseconds: 200));
}

void main() {
  const api = String.fromEnvironment('API_BASE_URL');
  if (api != 'http://10.0.2.2:11002/api/v1') {
    throw StateError(
      'Integration writes require explicit isolated local API_BASE_URL',
    );
  }
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets(
    'real API: reading, auth, contribution, favorite, comment and dark mode',
    (tester) async {
      final prefs = await SharedPreferences.getInstance();
      for (final key in prefs.getKeys().where((k) => k.startsWith('draft.'))) {
        await prefs.remove(key);
      }
      await prefs.setInt('themeMode', ThemeMode.light.index);
      await app.main();
      await binding.convertFlutterSurfaceToImage();
      Future<void> shot(String name) async {
        await tester.pumpAndSettle();
        final bytes = await binding.takeScreenshot(name);
        await File('${Directory.systemTemp.path}/$name.png')
            .writeAsBytes(bytes);
      }

      await ready(tester, find.text('焦点阅读'));
      await tester.pumpAndSettle();
      await tap(tester, find.text('我的').last);
      if (find.text('登录 / 注册').evaluate().isNotEmpty) {
        await tap(tester, find.text('登录 / 注册'));
        await tester.enterText(
          find.byType(TextFormField).at(0),
          'flutter_reader',
        );
        await tester.enterText(
          find.byType(TextFormField).at(1),
          'Reader123456',
        );
        await tap(tester, find.widgetWithText(FilledButton, '登录'));
        await ready(tester, find.text('全栈读者'));
      }
      await shot('prototype-member');
      await tap(tester, find.text('我的文章'));
      await shot('prototype-drafts');
      await tap(tester, find.byTooltip('写文章'));
      await ready(tester, find.byKey(const ValueKey('editor-title')));
      await shot('prototype-editor');
      final title = '模拟器投稿验收 ${DateTime.now().millisecondsSinceEpoch}';
      await tester.enterText(find.byKey(const ValueKey('editor-title')), title);
      await tester.enterText(
        find.byKey(const ValueKey('editor-content')),
        '## 移动端实践\n\n这篇稿件通过 Flutter APP 在 Android 模拟器上创建。\n\n- 阅读\n- 写作\n- 交流',
      );
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pumpAndSettle();
      await tap(tester, find.text('保存草稿'));
      await ready(tester, find.text('草稿已保存'));
      await tap(tester, find.text('预览'));
      await ready(tester, find.text('移动端实践'));
      await shot('prototype-preview');
      await tap(tester, find.text('编辑'));
      await tap(tester, find.text('提交审核'));
      await ready(tester, find.text('已提交审核'));
      expect(find.text('保存草稿'), findsNothing);
      await tap(tester, find.byTooltip('返回'));
      await ready(tester, find.text(title));
      await tester.tap(find.byType(BackButton).first);
      await tester.pumpAndSettle();
      await tap(tester, find.text('首页').last);
      await tap(tester, find.text('Flutter：从阅读到创作，让知识持续生长').first);
      await ready(tester, find.byTooltip('目录'));
      await tester.pumpAndSettle();
      await tap(tester, find.byTooltip('目录'));
      expect(find.text('文章目录'), findsOneWidget);
      await tap(tester, find.text('重复标题').last);
      if (find.text('已收藏').evaluate().isNotEmpty) {
        await tap(tester, find.text('已收藏'));
      }
      await ready(tester, find.text('收藏'));
      await tap(tester, find.text('收藏'));
      await ready(tester, find.text('已收藏'));
      final comment = find.byType(TextField).last;
      await tester.ensureVisible(comment);
      await tester.enterText(comment, '来自 Android 模拟器的验收评论：真实接口与叠楼交互已接通。');
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pumpAndSettle();
      await tap(tester, find.text('发表评论'));
      await ready(tester, find.text('评论已发布'));
      await tester.tap(find.byType(BackButton).first);
      await tester.pumpAndSettle();
      await tap(tester, find.text('我的').last);
      await tap(tester, find.byTooltip('设置'));
      await tap(tester, find.text('深色'));
      await tap(tester, find.byType(BackButton));
      expect(tester.takeException(), isNull);
      await tap(tester, find.text('首页').last);
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'native file upload reaches the real backend and can be downloaded',
    (tester) async {
      final api = ApiClient(
        baseUrl: 'http://10.0.2.2:11002/api/v1',
        vault: _TestVault(),
      );
      final auth = await api.request(
        '/auth/login',
        method: 'POST',
        data: {'username': 'flutter_reader', 'password': 'Reader123456'},
        refreshAllowed: false,
      );
      await api.install(Map<String, dynamic>.from(auth as Map));
      final dir = await Directory.systemTemp.createTemp('reader-upload-');
      try {
        final file = File('${dir.path}/pixel.png');
        await file.writeAsBytes(
          base64Decode(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE1sAAAAASUVORK5CYII=',
          ),
        );
        final url = await uploadImage(api, XFile(file.path));
        final response = await api.dio.get<List<int>>(
          url,
          options: Options(responseType: ResponseType.bytes),
        );
        expect(response.statusCode, 200);
        expect(response.data!.length, greaterThan(30));
        final wrong = File('${dir.path}/wrong.txt');
        await wrong.writeAsString('not an image');
        await expectLater(
          uploadImage(api, XFile(wrong.path)),
          throwsA(isA<ApiFailure>()),
        );
      } finally {
        await dir.delete(recursive: true);
        api.dio.close();
      }
    },
  );
}

class _TestVault implements TokenVault {
  String? token;
  @override
  Future<String?> read() async => token;
  @override
  Future<void> write(String? value) async {
    token = value;
  }
}
