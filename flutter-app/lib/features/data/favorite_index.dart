import 'dart:async';

import '../../core/cache/data_cache.dart';

import 'package:fullstack_reader/features/data/reader_models.dart';

/// 收藏接口没有单篇状态端点；只在扫完整个列表后才能判断“未收藏”。
class FavoriteIndex {
  FavoriteIndex({required this.loadPage, required this.savedAt});
  final Future<PageResult<Article>> Function(int) loadPage;
  final DateTime? Function(int) savedAt;
  final _ids = <int>{};
  int _page = 0, _version = 0;
  bool _complete = false;
  DateTime? _time;
  Future<void>? _scan;
  // 失效时提升版本；旧分页扫描结束后不能覆盖新扫描的状态。
  void resetFavoriteIndex() {
    _version++;
    _ids.clear();
    _page = 0;
    _complete = false;
    _time = null;
    _scan = null;
  }

  final overrides = <int, (bool, DateTime)>{};
  // 刚发生的乐观操作优先于分页结果；未知不等于未收藏。
  Future<bool> contains(int id, {bool forced = false}) async {
    final known = overrides[id];
    if (!forced &&
        known != null &&
        DateTime.now().difference(known.$2) < const Duration(seconds: 30)) {
      return known.$1;
    }
    if (forced ||
        (_scan == null &&
            _time != null &&
            DateTime.now().difference(_time!) >= const Duration(seconds: 30))) {
      resetFavoriteIndex();
    }
    // 多个文章共享同一页扫描任务，直到找到目标或服务端确认没有下一页。
    while (true) {
      if (_ids.contains(id)) return true;
      if (_complete) return false;
      try {
        await (_scan ??= _scanFavoritePage());
      } on CacheSuperseded {
        continue;
      }
    }
  }

  // 索引年龄从源缓存保存时间计算，读取旧页不会让索引重新变新。
  Future<void> _scanFavoritePage() async {
    final version = _version;
    try {
      final next = _page + 1;
      final page = await loadPage(next);
      if (version != _version) throw CacheSuperseded();
      _ids.addAll(page.items.map((a) => a.id));
      _page = next;
      _complete = !page.hasMore;
      _time ??= savedAt(next) ?? DateTime.now();
    } finally {
      if (version == _version) _scan = null;
    }
  }
}
