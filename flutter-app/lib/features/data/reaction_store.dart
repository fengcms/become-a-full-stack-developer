import '../../core/cache/cache_limits.dart';

import 'package:fullstack_reader/core/network/endpoints.dart';

import 'dart:async';

import '../../core/cache/data_cache.dart';

/// 点赞和收藏的乐观值跨页面共享；失败时由调用方提交原值回滚。
class ReactionStore {
  ReactionStore({
    required this.cache,
    required this.key,
    required this.policy,
    required this.resourceTags,
    required this.favoriteOverrides,
  });
  final DataCache cache;
  final String Function(String, Map<String, dynamic>, {bool private}) key;
  final CachePolicy? Function(String) policy;
  final Set<String> Function(String) resourceTags;
  final Map<int, (bool, DateTime)> favoriteOverrides;
  final reactions = <int, Map<String, dynamic>>{};
  final events = StreamController<int>.broadcast();
  // local=false 表示读取基线，只更新展示值而不续期互动状态缓存。
  void set(
    int id, {
    bool? liked,
    int? count,
    bool? favorite,
    bool local = true,
  }) {
    final old = reactions[id] ?? {};
    if (reactions.length >= CacheLimits.reactions &&
        !reactions.containsKey(id)) {
      reactions.remove(reactions.keys.first);
    }
    reactions[id] = {
      ...old,
      'savedAt': DateTime.now().millisecondsSinceEpoch,
      'liked': ?liked,
      'likeCount': ?count,
      'favorite': ?favorite,
    };
    // 点赞状态与数量必须成对种入，防止单独更新计数破坏状态一致性。
    if (local && liked != null && count != null) {
      final path = Endpoints.likeStatus(id);
      cache.seed(
        key(path, const {}, private: true),
        {'liked': liked, 'likeCount': count},
        policy(path)!,
        resourceTags(path),
      );
    }
    if (favoriteOverrides.length >= CacheLimits.favoriteOverrides &&
        !favoriteOverrides.containsKey(id)) {
      favoriteOverrides.remove(favoriteOverrides.keys.first);
    }
    if (local && favorite != null) {
      favoriteOverrides[id] = (favorite, DateTime.now());
    }
    // 仅修改具有文章标题的摘要，避免误改评论等同名 id 对象。
    if (count != null) {
      dynamic patch(dynamic value) {
        if (value is List) return value.map(patch).toList();
        if (value is Map) {
          return {
            for (final e in value.entries)
              e.key:
                  e.key == 'likeCount' &&
                      value['id'] == id &&
                      value.containsKey('title')
                  ? count
                  : patch(e.value),
          };
        }
        return value;
      }

      cache.patch(patch);
    }
    // 所有页面订阅同一文章事件，使详情与列表立即反映乐观结果。
    events.add(id);
  }
}
