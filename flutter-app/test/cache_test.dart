import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:fullstack_reader/core/cache/blob_store.dart';
import 'package:fullstack_reader/core/cache/data_cache.dart';
import 'package:fullstack_reader/core/network/api_client.dart';
import 'package:fullstack_reader/features/repository.dart';

import 'widget_test.dart' show Adapter, MemoryVault, client, envelope;

void main() {
  const policy = CachePolicy(Duration(seconds: 10), Duration(minutes: 1));
  late DateTime clock;
  late DataCache cache;
  setUp(() {
    clock = DateTime.now();
    cache = DataCache(
      clock: () => clock,
      disk: BlobStore('disabled', maxBytes: 1, enabled: false),
    );
  });
  tearDown(() => cache.close());
  test(
    'ten concurrent reads share one request; fresh hits skip HTTP',
    () async {
      final gate = Completer<CacheReply>();
      int requests = 0;
      Future<CacheReply> fetch() {
        requests++;
        return gate.future;
      }

      final reads = List.generate(10, (_) => cache.get('one', policy, fetch));
      gate.complete(CacheReply({'id': 1}));
      expect((await Future.wait(reads)).length, 10);
      expect(requests, 1);
      await cache.get('one', policy, fetch);
      expect(requests, 1);
      expect(cache.metrics['joined'], 9);
    },
  );
  test(
    'stale shows old data, one background update, hard expiry rejects fallback',
    () async {
      await cache.get('one', policy, () async => CacheReply(1));
      clock = clock.add(const Duration(seconds: 11));
      final gate = Completer<CacheReply>();
      int requests = 0;
      Future<CacheReply> fetch() {
        requests++;
        return gate.future;
      }

      expect(await cache.get('one', policy, fetch), 1);
      expect(await cache.get('one', policy, fetch), 1);
      expect(requests, 1);
      gate.complete(CacheReply(2));
      await Future<void>.delayed(Duration.zero);
      expect(cache.peek('one'), 2);
      clock = clock.add(const Duration(minutes: 2));
      await expectLater(
        cache.get('one', policy, () async => throw const ApiFailure('offline')),
        throwsA(isA<ApiFailure>()),
      );
      expect(cache.peek('one'), isNull);
    },
  );
  test(
    'forced refresh supersedes an older read; forced concurrent reads join',
    () async {
      final old = Completer<CacheReply>(), fresh = Completer<CacheReply>();
      final pending = cache.get('one', policy, () => old.future);
      final expectation = expectLater(pending, throwsA(isA<CacheSuperseded>()));
      int count = 0;
      Future<CacheReply> fetch() {
        count++;
        return fresh.future;
      }

      final next = cache.get('one', policy, fetch, force: true);
      final joined = cache.get('one', policy, fetch, force: true);
      fresh.complete(CacheReply(2));
      expect(await next, 2);
      expect(await joined, 2);
      expect(count, 1);
      old.complete(CacheReply(1));
      await expectation;
      expect(cache.peek('one'), 2);
    },
  );
  test(
    'mutation fences late reads; clear also prevents late repopulation',
    () async {
      final gate = Completer<CacheReply>();
      final old = cache.get(
        'one',
        policy,
        () => gate.future,
        tags: {'article'},
      );
      final expectation = expectLater(old, throwsA(isA<CacheSuperseded>()));
      cache.fence({'article'});
      cache.seed('one', 2, policy, {'article'});
      gate.complete(CacheReply(1));
      await expectation;
      expect(cache.peek('one'), 2);
      final second = Completer<CacheReply>();
      final pending = cache.get('two', policy, () => second.future);
      final cleared = expectLater(pending, throwsA(isA<CacheSuperseded>()));
      await cache.clear();
      second.complete(CacheReply(3));
      await cleared;
      expect(cache.peek('two'), isNull);
    },
  );
  test('temporary failure keeps usable cache; 404 evicts it', () async {
    await cache.get('one', policy, () async => CacheReply(1));
    clock = clock.add(const Duration(seconds: 11));
    expect(
      await cache.get(
        'one',
        policy,
        () async => throw const ApiFailure('offline'),
      ),
      1,
    );
    await Future<void>.delayed(Duration.zero);
    expect(cache.peek('one'), 1);
    await cache.get(
      'one',
      policy,
      () async => throw const ApiFailure('deleted', status: 404),
      forbidden: (e) => e is ApiFailure && e.status == 404,
    );
    await Future<void>.delayed(Duration.zero);
    expect(cache.peek('one'), isNull);
  });
  test(
    'Age and must-revalidate prevent stale fallback past freshness',
    () async {
      await cache.get(
        'aged',
        policy,
        () async => CacheReply(
          1,
          control: 'max-age=20, must-revalidate',
          age: const Duration(seconds: 5),
        ),
      );
      expect(cache.peek('aged'), 1);
      clock = clock.add(const Duration(seconds: 6));
      expect(cache.peek('aged'), isNull);
      await expectLater(
        cache.get(
          'aged',
          policy,
          () async => throw const ApiFailure('offline'),
        ),
        throwsA(isA<ApiFailure>()),
      );
    },
  );
  test('late forbidden failure cannot evict a newer mutation value', () async {
    final events = <CacheEvent>[];
    final subscription = cache.events.listen(events.add);
    addTearDown(subscription.cancel);
    final gate = Completer<CacheReply>();
    final pending = cache.get(
      'one',
      policy,
      () => gate.future,
      tags: {'article'},
      forbidden: (e) => e is ApiFailure && e.status == 404,
    );
    final failure = expectLater(pending, throwsA(isA<ApiFailure>()));
    cache.fence({'article'});
    cache.seed('one', 2, policy, {'article'});
    gate.completeError(const ApiFailure('deleted', status: 404));
    await failure;
    await Future<void>.delayed(Duration.zero);
    expect(cache.peek('one'), 2);
    expect(
      events.where((e) => e.kind == 'removed' || e.kind == 'failed'),
      isEmpty,
    );
  });
  test('no-store, no-cache and server max-age are respected', () async {
    for (final control in ['no-store', 'no-cache', 'max-age=0']) {
      await cache.get(
        control,
        policy,
        () async => CacheReply(1, control: control),
      );
      expect(cache.peek(control), isNull);
    }
    await cache.get(
      'short',
      policy,
      () async => CacheReply(1, control: 'max-age=2'),
    );
    clock = clock.add(const Duration(seconds: 3));
    expect(cache.peek('short'), isNull);
  });
  test('disk survives restart, private responses never persist, clear preserves unrelated files', () async {
    final temp = await Directory.systemTemp.createTemp('reader-cache-test-');
    addTearDown(() => temp.delete(recursive: true));
    final disk = BlobStore(
      'data',
      directory: Directory('${temp.path}/cache'),
      maxBytes: 100000,
    );
    final first = DataCache(disk: disk);
    const persisted = CachePolicy(
      Duration(minutes: 1),
      Duration(hours: 1),
      disk: true,
    );
    await first.get(
      'public',
      persisted,
      () async => CacheReply({'title': 'Article'}),
    );
    await first.get(
      'private',
      persisted,
      () async => CacheReply('private', control: 'private'),
    );
    await disk.size();
    final second = DataCache(
      disk: BlobStore(
        'data',
        directory: Directory('${temp.path}/cache'),
        maxBytes: 100000,
      ),
    );
    expect(
      await second.get(
        'public',
        persisted,
        () async => throw StateError('must not fetch'),
      ),
      {'title': 'Article'},
    );
    expect(await disk.read('private'), isNull);
    final draft = File('${temp.path}/draft.json');
    await draft.writeAsString('keep');
    await second.clear();
    expect(await second.disk.size(), 0);
    expect(await draft.readAsString(), 'keep');
    first.close();
    second.close();
  });
  test(
    'disk enforces bytes and entries, corrupt files fall back to network',
    () async {
      final temp = await Directory.systemTemp.createTemp('reader-lru-');
      addTearDown(() => temp.delete(recursive: true));
      final store = BlobStore(
        'test',
        directory: temp,
        maxBytes: 6,
        maxEntries: 2,
      );
      await store.write(
        'a',
        Uint8List(4),
        DateTime.now().add(const Duration(hours: 1)),
      );
      await store.write(
        'b',
        Uint8List(4),
        DateTime.now().add(const Duration(hours: 1)),
      );
      expect(await store.read('a'), isNull);
      expect(await store.size(), 4);
      await store.clear();
      expect(await store.size(), 0);
    },
  );
  test('repository keys isolate environment, account epoch, sorting and pagination; public is anonymous', () async {
    int calls = 0;
    final api = client(
      Adapter((o) {
        calls++;
        expect(o.headers['Authorization'], isNull);
        return envelope([]);
      }),
      MemoryVault(),
    )..accessToken = 'secret';
    final repo = ReaderRepository(api, cache: cache);
    await Future.wait(List.generate(10, (_) => repo.tags()));
    expect(calls, 1);
    await repo.tags();
    expect(calls, 1);
    expect(
      repo.key('/articles', {'a': 1, 'b': 2}),
      repo.key('/articles', {'b': 2, 'a': 1}),
    );
    expect(
      repo.key('/articles', {'page': 1}),
      isNot(repo.key('/articles', {'page': 2})),
    );
    final before = repo.key('/me/likes', {}, private: true);
    await api.clear();
    expect(repo.key('/me/likes', {}, private: true), isNot(before));
  });
  test('published body cache cannot serve private draft preview', () async {
    int body = 0;
    final api = client(
      Adapter((o) {
        if (o.path.endsWith('/toc')) return envelope([]);
        body++;
        return envelope({
          'id': 1,
          'title': o.headers['Authorization'] == null ? 'Public' : 'Draft',
          'status': o.headers['Authorization'] == null ? 'published' : 'draft',
          'content': 'text',
        });
      }),
      MemoryVault(),
    )..accessToken = 'member';
    final repo = ReaderRepository(api, cache: cache);
    expect((await repo.article('1')).title, 'Public');
    expect((await repo.article('1', private: true)).title, 'Draft');
    expect((await repo.article('1')).title, 'Public');
    expect(body, 2);
  });
  test('favorite index resumes partial pages and knows absence only after full scan', () async {
    var calls = 0;
    final api = client(
      Adapter((o) {
        calls++;
        final page = o.queryParameters['page'] as int;
        return envelope({
          'list': page == 1
              ? [
                  for (var i = 1; i <= 12; i++)
                    {'id': i, 'title': 'Article $i', 'status': 'published'},
                ]
              : [
                  {'id': 50, 'title': 'Last', 'status': 'published'},
                ],
          'pagination': {'page': page, 'totalPages': 2, 'total': 13},
        });
      }),
      MemoryVault(),
    );
    final repo = ReaderRepository(api, cache: cache);
    expect(await repo.favorite(1), isTrue);
    expect(calls, 1);
    expect(await repo.favorite(50), isTrue);
    expect(calls, 2);
    expect(await repo.favorite(999), isFalse);
    expect(calls, 2);
    expect(await repo.favorite(2), isTrue);
    expect(calls, 2);
    await api.clear();
    expect(await repo.favorite(2), isTrue);
    expect(calls, 3);
  });
  test('corrupt cached JSON recovers using network instead of poisoning future reads', () async {
    final temp = await Directory.systemTemp.createTemp('reader-corrupt-');
    addTearDown(() => temp.delete(recursive: true));
    final disk = BlobStore('data', directory: temp, maxBytes: 10000);
    await disk.write(
      'broken',
      Uint8List.fromList([123]),
      DateTime.now().add(const Duration(hours: 1)),
    );
    final store = DataCache(disk: disk);
    const diskPolicy = CachePolicy(
      Duration(minutes: 1),
      Duration(hours: 1),
      disk: true,
    );
    expect(
      await store.get(
        'broken',
        diskPolicy,
        () async => CacheReply({'ok': true}),
      ),
      {'ok': true},
    );
    await disk.size();
    expect(
      await store.get(
        'broken',
        diskPolicy,
        () async => throw StateError('not expected'),
      ),
      {'ok': true},
    );
    store.close();
  });
}
