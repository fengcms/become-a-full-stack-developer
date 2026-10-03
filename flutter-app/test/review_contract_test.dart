import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:fullstack_reader/core/cache/blob_store.dart';
import 'package:fullstack_reader/core/cache/cache_key.dart';
import 'package:fullstack_reader/core/cache/cache_limits.dart';
import 'package:fullstack_reader/core/cache/data_cache.dart';
import 'package:fullstack_reader/core/network/endpoints.dart';
import 'package:fullstack_reader/features/data/cache_policy_table.dart';
import 'package:fullstack_reader/features/repository.dart';

import 'widget_test.dart' show Adapter, MemoryVault, client, envelope;

void main() {
  test('typed keys preserve v1 disk identity and reject corrupt metadata', () {
    const key = CacheKey('https://example.test/api/v1', 'public', '/articles', {
      'sort': '-createdAt',
      'page': 1,
    });
    final legacy = jsonEncode([
      'v1',
      key.baseUrl,
      'public',
      '/articles',
      {'page': 1, 'sort': '-createdAt'},
    ]);
    expect(key.encode(), legacy);
    final restored = CacheKey.tryParse(legacy)!;
    expect(restored.baseUrl, key.baseUrl);
    expect(restored.path, key.path);
    expect(restored.query, key.query);
    for (final invalid in [
      'broken',
      '{}',
      '["v2","base","public","/articles",{}]',
      '["v1",null,"public","/articles",{}]',
    ]) {
      expect(CacheKey.tryParse(invalid), isNull);
    }
  });

  test(
    'resource rules keep object exceptions, private tags and mutation links',
    () {
      final table = CachePolicyTable();
      expect(
        () => table.validate(Endpoints.siteSettings, {'copyright': 'site'}),
        returnsNormally,
      );
      expect(
        () => table.validate(Endpoints.unreadCount, {'count': 3}),
        returnsNormally,
      );
      expect(
        () => table.validate(Endpoints.categoriesTree, {}),
        throwsFormatException,
      );
      expect(
        () => table.validate(Endpoints.meNotifications, {}),
        throwsFormatException,
      );
      expect(table.policy(Endpoints.login), isNull);
      expect(table.policy(Endpoints.article(1)), isNull);
      expect(table.policy(Endpoints.like(1)), isNull);
      expect(table.policy(Endpoints.likeStatus(1))?.disk, isFalse);
      expect(
        table.resourceTags(Endpoints.likeStatus(1)),
        containsAll(['private', 'reactions:1']),
      );
      expect(
        table.mutationTags(Endpoints.like(1), null),
        contains('reactions:1'),
      );
      expect(
        table.mutationTags(Endpoints.comments(1), null),
        contains('comments:1'),
      );
      expect(
        table.mutationTags(Endpoints.favorite(1), null),
        contains(Endpoints.meFavorites),
      );
      expect(
        table.mutationTags(Endpoints.submit(1), null),
        containsAll(['articleBodies', 'articleLists', Endpoints.meArticles]),
      );
      expect(
        table.forQuery(Endpoints.articles, {
          'page': 4,
        }, table.policy(Endpoints.articles)!).disk,
        isFalse,
      );
      expect(
        Endpoints.article('含 空格/slug'),
        '/articles/%E5%90%AB%20%E7%A9%BA%E6%A0%BC%2Fslug',
      );
    },
  );

  test(
    'overview counts remain named and likes count spans multiple pages',
    () async {
      final calls = <String>[];
      final api = client(
        Adapter((o) {
          calls.add('${o.path}:${o.queryParameters['page']}');
          if (o.path == Endpoints.meLikes) {
            final count = o.queryParameters['page'] == 1 ? 100 : 1;
            return envelope(
              List.generate(count, (i) => {'id': i + 1, 'title': 'like'}),
            );
          }
          final total = {
            Endpoints.meFavorites: 7,
            Endpoints.meHistory: 9,
            Endpoints.meArticles: 11,
          }[o.path];
          return envelope({
            'list': [],
            'pagination': {'page': 1, 'totalPages': 1, 'total': total},
          });
        }),
        MemoryVault(),
      );
      final cache = DataCache(
        disk: BlobStore('test', maxBytes: 1, enabled: false),
      );
      addTearDown(cache.close);
      final repo = ReaderRepository(api, cache: cache);
      final first = await repo.overview();
      expect(first['counts'], {
        'favorites': 7,
        'likes': 101,
        'history': 9,
        'articles': 11,
      });
      expect(first['history'], isEmpty);
      final requests = calls.length;
      expect(requests, 5);
      expect(await repo.overview(), first);
      expect(calls.length, requests);
    },
  );

  test(
    'search budget follows semantic resource tags rather than URL strings',
    () async {
      final cache = DataCache(
        disk: BlobStore('test', maxBytes: 1, enabled: false),
      );
      addTearDown(cache.close);
      const policy = CachePolicy(Duration(minutes: 1), Duration(minutes: 5));
      for (int i = 0; i <= CacheLimits.searches; i++) {
        cache.seed('arbitrary-query-$i', i, policy, {CacheTags.searchResults});
      }
      expect(cache.peek('arbitrary-query-0'), isNull);
      expect(cache.peek('arbitrary-query-1'), 1);
      expect(
        cache.peek('arbitrary-query-${CacheLimits.searches}'),
        CacheLimits.searches,
      );
    },
  );
}
