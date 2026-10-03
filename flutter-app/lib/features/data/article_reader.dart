import 'reader_models.dart';
import '../../core/cache/cache_key.dart';
import '../../core/cache/cache_limits.dart';

import 'package:fullstack_reader/core/network/endpoints.dart';

import 'dart:async';

import '../../core/cache/data_cache.dart';
import '../../core/network/api_client.dart';

/// 已发布正文与目录作为一个版本保存，避免目录指向旧内容。
class ArticleReader {
  ArticleReader({
    required this.cache,
    required this.baseUrl,
    required this.key,
    required this.fetch,
    required this.trackKey,
    required this.forbidden,
  });
  final DataCache cache;
  final String baseUrl;
  final String Function(String, Map<String, dynamic>) key;
  final Future<CacheReply> Function(String, {bool anonymous}) fetch;
  final void Function(String) trackKey;
  final bool Function(Object) forbidden;
  final aliases = <String, String>{};
  // id 与 slug 恢复到同一正文键；磁盘别名必须匹配当前 API 环境。
  Future<Map<String, dynamic>> read(String id, {bool force = false}) async {
    var canonical = aliases[id] ?? id;
    if (!aliases.containsKey(id) && !force) {
      final persisted = await cache.disk.findKey(
        (key, meta) => matchesAlias(key, meta, id),
      );
      if (persisted != null) {
        canonical = CacheKey.tryParse(persisted)!.path
            .substring(CacheKeys.articlePrefix.length);
      }
    }
    final k = key(CacheKeys.article(canonical), const {});
    trackKey(k);
    final data = jsonMap(
      await cache.get(
        k,
        const CachePolicy(
          Duration(minutes: 10),
          Duration(hours: 24),
          disk: true,
        ),
        () => fetchBundle(canonical),
        force: force,
        tags: {'article:$canonical', 'articleBodies'},
        forbidden: forbidden,
      ),
    );
    final a = jsonMap(data['article']);
    if (aliases.length > CacheLimits.articleAliases) aliases.clear();
    aliases['${a['id']}'] = canonical;
    if (a['slug'] is String) aliases[a['slug']] = canonical;
    return data;
  }

  // 别名只能指向同一 API 环境的公开正文，损坏索引按未命中处理。
  bool matchesAlias(String key, Map<String, dynamic> meta, String id) {
    final parsed = CacheKey.tryParse(key);
    return (meta['aliases'] as List? ?? []).contains(id) &&
        parsed?.baseUrl == baseUrl &&
        parsed?.scope == 'public' &&
        (parsed?.path.startsWith(CacheKeys.articlePrefix) ?? false);
  }

  // 公开正文始终匿名获取，不能把作者预览权限带入可落盘内容。
  Future<CacheReply> fetchBundle(String canonical) async {
    final response = await fetch(Endpoints.article(canonical), anonymous: true);
    final a = jsonMap(response.value);
    if (a['status'] != 'published') {
      throw const ApiFailure('内容不存在或暂不可见', code: 3001, status: 404);
    }
    // TOC and content are installed together. Never attach a previous TOC to new content.
    final toc = await fetch(Endpoints.toc(a['id']), anonymous: true);
    if (toc.value is! List || a['id'] is! int || a['content'] is! String) {
      throw const FormatException('文章或目录响应格式不正确');
    }
    // When a version is available, verify that publication did not change while fetching the TOC.
    if (a['updatedAt'] != null) {
      final check = jsonMap(
        (await fetch(Endpoints.article(a['id']), anonymous: true)).value,
      );
      if (check['updatedAt'] != a['updatedAt'] ||
          check['content'] != a['content'] ||
          check['status'] != 'published') {
        throw const ApiFailure('文章刚刚发生更新，请刷新后继续阅读', code: 3003);
      }
    }
    // 正文和目录共同遵守较严格的响应限制，不能独立续期其中一份。
    final control = '${response.control},${toc.control}';
    return CacheReply(
      {'article': a, 'toc': toc.value},
      control: control,
      age: response.age,
    );
  }
}
