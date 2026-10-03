import 'cache_limits.dart';

import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'blob_store.dart';

/// fresh 决定何时后台更新，maxAge 决定弱网下能否继续展示；disk 必须显式允许。
class CachePolicy {
  const CachePolicy(this.fresh, this.maxAge, {this.disk = false});
  final Duration fresh, maxAge;
  final bool disk;
}

/// 响应体与缓存控制头成组传递，服务端更严格的缓存限制优先。
class CacheReply {
  CacheReply(this.value, {this.control = '', this.age = Duration.zero});
  final dynamic value;
  final String control;
  final Duration age;
}

/// 缓存按键发布更新、移除或失败事件，让可见页面决定如何刷新。
class CacheEvent {
  const CacheEvent(this.key, this.kind, {this.error});
  final String key, kind;
  final Object? error;
}

/// 旧请求已被刷新、写操作或清理取代；调用方不能把其结果安装到页面。
class CacheSuperseded implements Exception {}

/// 数据与保存时间一起存储；恢复磁盘条目不会延长原来的有效期。
class CacheEntry {
  CacheEntry(this.value, this.saved, this.fresh, this.maxAge, this.tags);
  dynamic value;
  final DateTime saved;
  final Duration fresh, maxAge;
  final Set<String> tags;
  int get bytes => utf8.encode(jsonEncode(value)).length;
  Map<String, dynamic> toJson() => {
    'data': value,
    'saved': saved.millisecondsSinceEpoch,
    'fresh': fresh.inMilliseconds,
    'max': maxAge.inMilliseconds,
    'tags': tags.toList(),
  };
  factory CacheEntry.fromJson(Map<String, dynamic> j) => CacheEntry(
    j['data'],
    DateTime.fromMillisecondsSinceEpoch(j['saved'] as int),
    Duration(milliseconds: j['fresh'] as int),
    Duration(milliseconds: j['max'] as int),
    (j['tags'] as List).cast<String>().toSet(),
  );
}

/// 仅缓存仓库显式授权的读取；新鲜命中、过期回源和写后失效共享版本栅栏。
class DataCache {
  DataCache({
    BlobStore? disk,
    DateTime Function()? clock,
    this.maxEntries = CacheLimits.memoryEntries,
    this.maxBytes = CacheLimits.memoryBytes,
  }) : disk =
           disk ??
           BlobStore(
             'data',
             maxBytes: CacheLimits.dataDiskBytes,
             maxEntries: CacheLimits.dataDiskEntries,
           ),
       now = clock ?? DateTime.now;
  final BlobStore disk;
  final DateTime Function() now;
  final int maxEntries, maxBytes;
  final _entries = <String, CacheEntry>{};
  final _flights = <String, Future<dynamic>>{};
  final _versions = <String, Object>{};
  Object _version(String key) => _versions.putIfAbsent(key, Object.new);
  final _forced = <String>{};
  final _keyTags = <String, Set<String>>{};
  final _events = StreamController<CacheEvent>.broadcast();
  Stream<CacheEvent> get events => _events.stream;
  int _epoch = 0;
  final metrics = <String, int>{};
  void count(String name) =>
      metrics.update(name, (v) => v + 1, ifAbsent: () => 1);
  void emit(CacheEvent e) {
    if (!_events.isClosed) _events.add(e);
  }

  // 先重排为最近使用条目，再按资源分类与总字节预算淘汰。
  void _put(String key, CacheEntry entry) {
    _entries.remove(key);
    _entries[key] = entry;
    for (final rule in {
      CacheTags.articleBodies: CacheLimits.articleBodies,
      CacheTags.searchResults: CacheLimits.searches,
    }.entries) {
      final keys = _entries.keys
          .where((k) => _entries[k]!.tags.contains(rule.key))
          .toList();
      while (keys.length > rule.value) {
        _entries.remove(keys.removeAt(0));
      }
    }
    var size = _entries.values.fold<int>(0, (s, e) => s + e.bytes);
    while (_entries.length > maxEntries || size > maxBytes) {
      size -= _entries.remove(_entries.keys.first)!.bytes;
    }
  }

  // 只返回仍在最大存活期内的数据；过期对象留在 Map 中也不能当作可用。
  dynamic peek(String key) {
    final e = _entries[key];
    return e != null && now().difference(e.saved) < e.maxAge ? e.value : null;
  }

  DateTime? savedAt(String key) => _entries[key]?.saved;
  bool usable(String key) => peek(key) != null;
  // 系统时间回拨时不把未来保存时间误判为新鲜。
  bool fresh(String key) {
    final e = _entries[key];
    return e != null &&
        now().difference(e.saved) >= Duration.zero &&
        now().difference(e.saved) < e.fresh;
  }

  // 强制刷新优先于后台请求；同一轮强制刷新仍合并，避免重复发网。
  Future<dynamic> get(
    String key,
    CachePolicy policy,
    Future<CacheReply> Function() fetch, {
    bool force = false,
    Set<String> tags = const {},
    bool Function(Object)? forbidden,
  }) async {
    _keyTags[key] = tags;
    if (_keyTags.length > CacheLimits.trackedKeys) {
      for (final old in _keyTags.keys.toList()) {
        if (_keyTags.length <= CacheLimits.trackedKeys) break;
        if (old != key &&
            !_entries.containsKey(old) &&
            !_flights.containsKey(old)) {
          _keyTags.remove(old);
          _versions.remove(old);
        }
      }
    }
    if (force && _flights.containsKey(key) && !_forced.contains(key)) {
      _versions[key] = Object();
      _flights.remove(key);
    }
    if (force) _forced.add(key);
    // 磁盘读取也必须检查代际，否则清理完成后旧磁盘读会重新填回内存。
    final startEpoch = _epoch, version = _version(key);
    var entry = _entries[key];
    if (!force && entry == null && policy.disk) {
      final bytes = await disk.read(key);
      if (_epoch != startEpoch || (_version(key)) != version) {
        throw CacheSuperseded();
      }
      if (bytes != null) {
        try {
          entry = CacheEntry.fromJson(
            Map<String, dynamic>.from(jsonDecode(utf8.decode(bytes)) as Map),
          );
          _put(key, entry);
          count('diskHit');
        } catch (_) {
          unawaited(disk.removeWhere((k, _) => k == key));
        }
      }
    }
    entry = _entries[key] ?? entry;
    if (!force &&
        entry != null &&
        now().difference(entry.saved) < entry.maxAge) {
      _put(key, entry);
      if (now().difference(entry.saved) < entry.fresh) {
        count('freshHit');
        return entry.value;
      }
      // 返回可用旧值并启动后台更新；后台失败通过事件通知页面。
      count('staleHit');
      unawaited(
        _fetch(
          key,
          policy,
          fetch,
          tags,
          forbidden,
        ).catchError((Object _) => null),
      );
      return entry.value;
    }
    if (entry != null && now().difference(entry.saved) >= entry.maxAge) {
      _entries.remove(key);
    }
    count('miss');
    return _fetch(key, policy, fetch, tags, forbidden);
  }

  // 同键只保留一个在途 Future，完成时只清除属于自身的登记。
  Future<dynamic> _fetch(
    String key,
    CachePolicy policy,
    Future<CacheReply> Function() fetch,
    Set<String> tags,
    bool Function(Object)? forbidden,
  ) {
    if (_flights.containsKey(key)) {
      count('joined');
      return _flights[key]!;
    }
    final epoch = _epoch, version = _version(key);
    late Future<dynamic> task;
    task = () async {
      count('network');
      try {
        final response = await fetch();
        if (epoch != _epoch || version != (_version(key))) {
          throw CacheSuperseded();
        }
        final adjusted = _applyControlHeaders(response, policy, tags);
        if (adjusted.storable) {
          _persistEntry(key, adjusted.entry, adjusted.disk);
          emit(CacheEvent(key, 'updated'));
        } else {
          _entries.remove(key);
          unawaited(disk.removeWhere((k, _) => k == key));
        }
        return response.value;
      } catch (e) {
        _handleFailure(key, e, epoch, version, forbidden);
        rethrow;
      } finally {
        if (identical(_flights[key], task)) {
          _flights.remove(key);
          _forced.remove(key);
        }
      }
    }();
    _flights[key] = task;
    return task;
  }

  // 缓存策略只允许收紧服务端限制；Age 扣减保存时间，不重置存活期。
  ({CacheEntry entry, bool storable, bool disk}) _applyControlHeaders(
    CacheReply response,
    CachePolicy policy,
    Set<String> tags,
  ) {
    final control = response.control.toLowerCase();
    var fresh = policy.fresh, max = policy.maxAge;
    final seconds = int.tryParse(
      RegExp(r'(?:^|,)\s*max-age\s*=\s*"?(\d+)')
              .firstMatch(control)
              ?.group(1) ??
          '',
    );
    if (seconds != null) {
      final age = Duration(seconds: seconds);
      if (age < fresh) fresh = age;
      if (age < max) max = age;
    }
    if (control.contains('no-cache')) {
      fresh = Duration.zero;
      max = Duration.zero;
    }
    if (control.contains('must-revalidate') && fresh < max) max = fresh;
    return (
      entry: CacheEntry(
        response.value,
        now().subtract(response.age),
        fresh,
        max,
        tags,
      ),
      storable: !control.contains('no-store') && max > Duration.zero,
      disk: policy.disk && !control.contains('private'),
    );
  }

  // 内存先安装；磁盘写入保持异步，由 BlobStore 的队列和清理代际保护。
  void _persistEntry(String key, CacheEntry entry, bool allowDisk) {
    _put(key, entry);
    if (!allowDisk || entry.bytes > CacheLimits.diskEntryBytes) return;
    final article = entry.value is Map ? entry.value['article'] : null;
    unawaited(
      disk.write(
        key,
        Uint8List.fromList(utf8.encode(jsonEncode(entry.toJson()))),
        entry.saved.add(entry.maxAge),
        metadata: {
          'tags': entry.tags.toList(),
          if (entry.tags.contains(CacheTags.articleBodies) && article is Map)
            'aliases': [
              '${article['id']}',
              if (article['slug'] is String) article['slug'],
            ],
        },
      ),
    );
  }

  // 旧代际的失败不驱逐新值；仅当前权限/删除错误移除缓存，弱网保留可用内容。
  void _handleFailure(
    String key,
    Object error,
    int epoch,
    Object version,
    bool Function(Object)? forbidden,
  ) {
    if (epoch != _epoch ||
        version != _version(key) ||
        error is CacheSuperseded) {
      return;
    }
    if (forbidden?.call(error) == true) {
      _entries.remove(key);
      unawaited(disk.removeWhere((k, _) => k == key));
      emit(CacheEvent(key, 'removed', error: error));
    } else {
      emit(CacheEvent(key, 'failed', error: error));
    }
  }

  /// Fence reads at mutation start; preserve visible data until its outcome.
  void fence(Set<String> tags) {
    for (final key in _keyTags.keys.toList()) {
      if (_keyTags[key]!.intersection(tags).isNotEmpty) {
        _versions[key] = Object();
        _flights.remove(key);
      }
    }
  }

  // 依赖标签同时清理内存和磁盘；旧网络响应已被 fence 隔断。
  void invalidate(Set<String> tags) {
    fence(tags);
    for (final key in _keyTags.keys.toList()) {
      if (_keyTags[key]!.intersection(tags).isNotEmpty) {
        _entries.remove(key);
        emit(CacheEvent(key, 'invalidated'));
      }
    }
    unawaited(
      disk.removeWhere((_, m) => (m['tags'] as List? ?? []).any(tags.contains)),
    );
  }

  // 乐观状态只种入内存；只有明确的本地操作才能开启新的短期状态窗口。
  void seed(String key, dynamic value, CachePolicy policy, Set<String> tags) {
    _keyTags[key] = tags;
    _put(key, CacheEntry(value, now(), policy.fresh, policy.maxAge, tags));
  }

  // 更新摘要中的显示字段不会刷新保存时间，也不会延长原条目的有效期。
  void patch(dynamic Function(dynamic) transform) {
    for (final key in _entries.keys.toList()) {
      _entries[key]!.value = transform(_entries[key]!.value);
      emit(CacheEvent(key, 'patched'));
    }
  }

  // 先提升全局代际再清理，阻止清理期间完成的请求回填旧数据。
  Future<void> clear() async {
    _epoch++;
    _entries.clear();
    _flights.clear();
    _versions.clear();
    _forced.clear();
    _keyTags.clear();
    emit(const CacheEvent('*', 'cleared'));
    await disk.clear();
  }

  // 内存压力仅释放可重建的值，不清除凭据或磁盘缓存。
  void trim() {
    _entries.clear();
  }

  // 关闭事件流后仍提高代际，确保未完成请求不能继续发布旧状态。
  void close() {
    _epoch++;
    _events.close();
  }
}
