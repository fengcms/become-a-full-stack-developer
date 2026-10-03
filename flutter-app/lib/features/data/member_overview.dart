import 'package:fullstack_reader/core/network/endpoints.dart';

import 'dart:async';

import '../../core/cache/data_cache.dart';
import '../../core/cache/cache_key.dart';

import 'package:fullstack_reader/features/data/reader_models.dart';

/// 会员概览分别命名统计字段，避免界面与接口靠数组顺序耦合。
class MemberOverview {
  MemberOverview({
    required this.cache,
    required this.key,
    required this.read,
    required this.trackKey,
    required this.forbidden,
  });
  final DataCache cache;
  final String Function(String, Map<String, dynamic>, {bool private}) key;
  final Future<dynamic> Function(String, {Map<String, dynamic> query}) read;
  final void Function(String) trackKey;
  final bool Function(Object) forbidden;
  // 概览只驻留内存，键包含账号与会话代际。
  Future<Map<String, dynamic>> load({bool forced = false}) async {
    final k = key(CacheKeys.overview, const {}, private: true);
    trackKey(k);
    return jsonMap(
      await cache.get(
        k,
        const CachePolicy(Duration(minutes: 1), Duration(minutes: 5)),
        () async {
          final results = Map.fromEntries(
            await Future.wait(
              {
                'favorites': Endpoints.meFavorites,
                'history': Endpoints.meHistory,
                'articles': Endpoints.meArticles,
              }.entries.map(
                (entry) async => MapEntry(
                  entry.key,
                  await read(entry.value, query: {'page': 1, 'pageSize': 3}),
                ),
              ),
            ),
          );
          // 点赞接口没有总数，必须逐页扫描，不能把首屏长度当成累计数量。
          int likes = 0, page = 1;
          while (true) {
            final batch = await read(
              Endpoints.meLikes,
              query: {'page': page, 'pageSize': 100},
            ) as List;
            likes += batch.length;
            if (batch.length < 100) break;
            page++;
          }
          return CacheReply({
            'counts': {
              'favorites': results['favorites']['pagination']['total'],
              'likes': likes,
              'history': results['history']['pagination']['total'],
              'articles': results['articles']['pagination']['total'],
            },
            'history': results['history']['list'],
          });
        },
        force: forced,
        tags: {'private', 'overview'},
        forbidden: forbidden,
      ),
    );
  }
}
