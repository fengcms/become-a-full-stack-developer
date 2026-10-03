import 'package:fullstack_reader/core/cache/data_cache.dart';
import 'package:fullstack_reader/core/cache/blob_store.dart';

import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:markdown/markdown.dart' as md;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:fullstack_reader/app/session.dart';
import 'package:fullstack_reader/app/theme/app_theme.dart';
import 'package:fullstack_reader/core/generated/models.dart';
import 'package:fullstack_reader/core/markdown/reader_markdown.dart';
import 'package:fullstack_reader/core/network/api_client.dart';
import 'package:fullstack_reader/features/comments.dart';
import 'package:fullstack_reader/features/discovery.dart';
import 'package:fullstack_reader/features/repository.dart';
import 'package:fullstack_reader/main.dart';

class MemoryVault implements TokenVault {
  String? token = 'refresh-1';
  @override
  Future<String?> read() async => token;
  @override
  Future<void> write(String? value) async {
    token = value;
  }
}

class Adapter implements HttpClientAdapter {
  Adapter(this.handle);
  final FutureOr<ResponseBody> Function(RequestOptions) handle;
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? stream,
    Future<void>? cancel,
  ) async => handle(options);
  @override
  void close({bool force = false}) {}
}

ResponseBody envelope(
  dynamic data, {
  int code = 0,
  int status = 200,
  Map<String, List<String>> headers = const {},
}) => ResponseBody.fromString(
  jsonEncode({'code': code, 'message': 'result', 'data': data}),
  status,
  headers: {
    'content-type': ['application/json'],
    ...headers,
  },
);
ApiClient client(Adapter adapter, MemoryVault vault) => ApiClient(
  baseUrl: 'http://localhost/api/v1',
  vault: vault,
  transport: Dio()..httpClientAdapter = adapter,
);
ApiComment comment(int id, int? parent) => ApiComment.fromJson({
  'id': id,
  'parentId': parent,
  'content': 'Comment $id',
  'status': 'approved',
});
void main() {
  test('concurrent 401 requests perform one refresh and replay with the rotated access token', () async {
    var refreshes = 0;
    final vault = MemoryVault();
    final gate = Completer<void>();
    final started = Completer<void>();
    final api = client(
      Adapter((o) async {
        if (o.path == '/auth/refresh') {
          refreshes++;
          if(!started.isCompleted) started.complete();
          await gate.future;
          return envelope({'accessToken': 'new', 'refreshToken': 'refresh-2'});
        }
        return o.headers['Authorization'] == 'Bearer new'
            ? envelope({'ok': true})
            : envelope(null, code: 1002, status: 401);
      }),
      vault,
    )..accessToken = 'old';
    final requests = List.generate(8, (_) => api.request('/me/profile'));
    await started.future;
    expect(refreshes, 1);
    gate.complete();
    await Future.wait(requests);
    expect(refreshes, 1);
    expect(vault.token, 'refresh-2');
  });
  test('logout discards in-flight private response', () async {
    final response = Completer<ResponseBody>();
    final vault = MemoryVault();
    final api = client(Adapter((_) => response.future), vault)
      ..accessToken = 'old';
    final pending = api.request('/me/profile');
    final expectation = expectLater(pending, throwsA(isA<SessionChanged>()));
    await Future<void>.delayed(Duration.zero);
    await api.clear();
    response.complete(envelope({'nickname': 'old account'}));
    await expectation;
    expect(vault.token, isNull);
    expect(api.accessToken, isNull);
  });
  test('replayed refresh clears the token family locally', () async {
    final vault = MemoryVault();
    final api = client(
      Adapter((_) => envelope(null, code: 1003, status: 401)),
      vault,
    );
    var expired = false;
    api.onExpired = () => expired = true;
    await expectLater(
      api.refresh(),
      throwsA(isA<ApiFailure>().having((e) => e.code, 'code', 1003)),
    );
    expect(vault.token, isNull);
    expect(expired, isTrue);
  });
  test('429 retries a read once and never repeats a write', () async {
    var calls = 0;
    final api = client(
      Adapter((_) {
        calls++;
        return envelope(
          null,
          code: 5001,
          status: 429,
          headers: {
            'retry-after': ['0'],
          },
        );
      }),
      MemoryVault(),
    );
    await expectLater(api.request('/articles'), throwsA(isA<ApiFailure>()));
    expect(calls, 2);
    calls = 0;
    await expectLater(
      api.request('/articles', method: 'POST', data: {'title': 'draft'}),
      throwsA(isA<ApiFailure>()),
    );
    expect(calls, 1);
  });
  test(
    'cross-page replies regroup when a parent arrives, cycles terminate',
    () {
      final first = groupComments([comment(3, 2)]);
      expect(first.keys, [2]);
      final full = groupComments([
        comment(3, 2),
        comment(2, 1),
        comment(1, null),
      ]);
      expect(full.keys, [1]);
      expect(full[1]!.length, 3);
      expect(
        groupComments([comment(1, 2), comment(2, 1)]).values
            .expand((x) => x)
            .length,
        2,
      );
    },
  );
  test('server ATX anchors bind duplicate headings without consuming Setext or code headings', () {
    final toc = [
      ApiTocItem.fromJson({'level': 2, 'text': '重复', 'anchor': 'server-one'}),
      ApiTocItem.fromJson({'level': 2, 'text': '重复', 'anchor': 'server-two'}),
    ];
    final syntax = ServerHeadingSyntax(toc);
    final nodes = md.Document(
      blockSyntaxes: [syntax],
      extensionSet: md.ExtensionSet.gitHubFlavored,
    ).parseLines('## 重复\n\n```\n# 不是标题\n```\n\n重复\n---\n\n## 重复'.split('\n'));
    final headings = nodes
        .whereType<md.Element>()
        .where((n) => n.tag == 'h2')
        .toList();
    expect(headings.map((h) => h.attributes['reader-anchor']).toList(), [
      'server-one',
      null,
      'server-two',
    ]);
    expect(syntax.cursor, 2);
  });
  testWidgets('TOC arriving after the body attaches usable widget anchors', (
    tester,
  ) async {
    const content = '## 第一节\n\n正文\n\n## 第二节\n\n正文';
    Widget root(List<ApiTocItem> toc, Map<String, GlobalKey> keys) =>
        MaterialApp(
          theme: buildAppTheme(Brightness.light),
          home: Scaffold(
            body: SingleChildScrollView(
              child: ReaderMarkdown(content, toc: toc, headingKeys: keys),
            ),
          ),
        );
    await tester.pumpWidget(root([], {}));
    final keys = {'first': GlobalKey(), 'second': GlobalKey()};
    final toc = [
      ApiTocItem.fromJson({'level': 2, 'text': '第一节', 'anchor': 'first'}),
      ApiTocItem.fromJson({'level': 2, 'text': '第二节', 'anchor': 'second'}),
    ];
    await tester.pumpWidget(root(toc, keys));
    await tester.pumpAndSettle();
    expect(keys['first']!.currentContext, isNotNull);
    expect(keys['second']!.currentContext, isNotNull);
    expect(tester.takeException(), isNull);
  });
  for (final width in [320.0, 375.0, 430.0]) {
    testWidgets(
      'focus cards do not overflow at $width dp with 1.3 text scale',
      (tester) async {
        tester.view.physicalSize = Size(width, 852);
        tester.view.devicePixelRatio = 1;
        tester.platformDispatcher.textScaleFactorTestValue = 1.3;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
        final a = Article.fromJson({
          'id': 1,
          'title': '一个很长的全栈开发实践标题，需要在小屏幕上保持可读并且不溢出视口边缘',
          'authorId': 1,
          'status': 'published',
          'summary': '通过组件、接口和真实验证，把想法逐步变成可靠的应用。',
        });
        await tester.pumpWidget(
          MaterialApp(
            theme: buildAppTheme(Brightness.light),
            home: Scaffold(body: FocusStories([a])),
          ),
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
      },
    );
  }
  testWidgets(
    'home, search empty state, theme switch and auth validation render at mobile width',
    (tester) async {
      tester.view.physicalSize = const Size(393, 852);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      SharedPreferences.setMockInitialValues({});
      final vault = MemoryVault()..token = null;
      final article = {
        'id': 1,
        'title': '从阅读到全栈实践',
        'authorId': 1,
        'status': 'published',
        'summary': '循序渐进地构建知识。',
      };
      final api = client(
        Adapter((o) {
          if (o.path == '/site/settings') {
            return envelope({'copyright': '成为全栈'});
          }
          if (o.path == '/search') {
            return envelope({
              'articles': {
                'list': [],
                'pagination': {'page': 1, 'totalPages': 0, 'total': 0},
              },
            });
          }
          return envelope({
            'list': [article],
            'pagination': {'page': 1, 'totalPages': 1, 'total': 1},
          });
        }),
        vault,
      );
      final session = AppSession(
        api,
        await SharedPreferences.getInstance(),
        cache: DataCache(
          disk: BlobStore('test', maxBytes: 100, enabled: false),
        ),
      );
      await session.restore();
      await tester.pumpWidget(
        ProviderScope(
          overrides: [sessionProvider.overrideWith((ref) => session)],
          child: const ReaderApp(),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('焦点阅读'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.tap(find.text('搜索').last);
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), '不存在');
      await tester.testTextInput.receiveAction(TextInputAction.search);
      await tester.pumpAndSettle();
      expect(find.text('这里还没有内容'), findsOneWidget);
      await tester.tap(find.text('我的').last);
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('设置'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('深色'));
      await tester.pumpAndSettle();
      await tester.tap(find.byType(BackButton));
      await tester.pumpAndSettle();
      expect(session.mode, ThemeMode.dark);
      expect(tester.takeException(), isNull);
      await tester.tap(find.text('登录 / 注册'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, '登录'));
      await tester.pumpAndSettle();
      expect(find.text('请输入用户名'), findsOneWidget);
      expect(find.text('密码至少 8 个字符'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
}
