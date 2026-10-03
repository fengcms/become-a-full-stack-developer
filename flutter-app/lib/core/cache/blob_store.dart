import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:path_provider/path_provider.dart';

/// 只保存可重建文件，清理范围不包含用户草稿或登录凭据。
class BlobStore {
  BlobStore(
    this.name, {
    required this.maxBytes,
    this.maxEntries = 500,
    this.directory,
    this.enabled = true,
  });
  final bool enabled;
  final String name;
  final int maxBytes, maxEntries;
  final Directory? directory;
  Directory? _root;
  Future<void>? _opening;
  Future<void> _queue = Future.value();
  final Map<String, Map<String, dynamic>> _index = {};
  int _generation = 0;
  String _file(String key) => sha256.convert(utf8.encode(key)).toString();

  // 首次打开合并为一个任务；缓存目录不可用时降级到无磁盘缓存。
  Future<void> open() => _opening ??= () async {
    if (!enabled) return;
    try {
      _root =
          directory ??
          Directory(
            '${(await getApplicationCacheDirectory()).path}/reader-v1/$name',
          );
      await _root!.create(recursive: true);
      await _readIndex();
      // Interrupted atomic writes and orphan blobs are safe to remove.
      final known = _index.keys.map(_file).toSet();
      await for (final entry in _root!.list()) {
        final base = entry.uri.pathSegments.last;
        if (entry is File && base != 'index.json' && !known.contains(base)) {
          await entry.delete();
        }
      }
    } catch (_) {
      _index.clear();
      _root = null;
    }
  }();

  /// 单独恢复索引：损坏时丢弃可重建元数据，再清除无主文件。
  Future<void> _readIndex() async {
    final index = File('${_root!.path}/index.json');
    if (!await index.exists()) return;
    try {
      final data = jsonDecode(await index.readAsString()) as Map;
      for (final e in data.entries) {
        final meta = Map<String, dynamic>.from(e.value as Map);
        if (meta['used'] is int &&
            meta['size'] is int &&
            meta['expires'] is int) {
          _index[e.key as String] = meta;
        }
      }
    } catch (_) {
      _index.clear();
      await index.delete();
    }
  }

  // 先等待排队写入；不存在、过期或损坏文件统一按未命中处理。
  Future<Uint8List?> read(String key) async {
    await _queue.catchError((Object _) {});
    await open();
    if (_root == null || !_index.containsKey(key)) return null;
    try {
      final entry = _index[key]!;
      if (DateTime.now().millisecondsSinceEpoch > (entry['expires'] as num)) {
        await removeWhere((k, _) => k == key);
        return null;
      }
      final bytes = await File('${_root!.path}/${_file(key)}').readAsBytes();
      entry['used'] = DateTime.now().millisecondsSinceEpoch;
      return bytes;
    } catch (_) {
      _index.remove(key);
      return null;
    }
  }

  // 别名查找只遍历未过期索引；无效元数据不能中断整个恢复流程。
  Future<String?> findKey(
    bool Function(String, Map<String, dynamic>) predicate,
  ) async {
    await _queue.catchError((Object _) {});
    await open();
    for (final entry in _index.entries) {
      try {
        if ((entry.value['expires'] as int) >
                DateTime.now().millisecondsSinceEpoch &&
            predicate(entry.key, entry.value)) {
          return entry.key;
        }
      } catch (_) {
        /* Ignore corrupt metadata. */
      }
    }
    return null;
  }

  DateTime? expiresAt(String key) => _index[key]?['expires'] is int
      ? DateTime.fromMillisecondsSinceEpoch(_index[key]!['expires'] as int)
      : null;

  Future<void> _serial(Future<void> Function() action) {
    final next = _queue.catchError((Object _) {}).then((_) async {
      await open();
      if (_root == null) return;
      try {
        await action();
        await _saveIndex();
      } catch (_) {
        /* Disk cache is optional. */
      }
    });
    _queue = next;
    return next;
  }

  Future<void> _saveIndex() async {
    final temp = File('${_root!.path}/index.tmp');
    await temp.writeAsString(jsonEncode(_index), flush: true);
    await temp.rename('${_root!.path}/index.json');
  }

  // 写入排队且检查清理代际，避免删除完成后旧写任务重新创建文件。
  Future<void> write(
    String key,
    Uint8List bytes,
    DateTime expires, {
    Map<String, dynamic> metadata = const {},
  }) {
    final generation = _generation;
    return _serial(() async {
      if (generation != _generation || bytes.length > maxBytes) return;
      final file = File('${_root!.path}/${_file(key)}.tmp');
      await file.writeAsBytes(bytes, flush: true);
      if (generation != _generation) {
        await file.delete();
        return;
      }
      await file.rename('${_root!.path}/${_file(key)}');
      _index[key] = {
        ...metadata,
        'size': bytes.length,
        'used': DateTime.now().millisecondsSinceEpoch,
        'expires': expires.millisecondsSinceEpoch,
      };
      final bodies =
          _index.keys
              .where(
                (key) => (_index[key]!['tags'] as List? ?? []).contains(
                  'articleBodies',
                ),
              )
              .toList()
            ..sort(
              (a, b) => (_index[a]!['used'] as int).compareTo(
                _index[b]!['used'] as int,
              ),
            );
      while (bodies.length > 100) {
        await _delete(bodies.removeAt(0));
      }
      final ordered = _index.keys.toList()
        ..sort(
          (a, b) =>
              (_index[a]!['used'] as int).compareTo(_index[b]!['used'] as int),
        );
      int bytesUsed = _index.values.fold(
        0,
        (sum, e) => sum + (e['size'] as int),
      );
      while ((bytesUsed > maxBytes || _index.length > maxEntries) &&
          ordered.isNotEmpty) {
        final key = ordered.removeAt(0);
        bytesUsed -= _index[key]!['size'] as int;
        await _delete(key);
      }
    });
  }

  Future<void> _delete(String key) async {
    _index.remove(key);
    final file = File('${_root!.path}/${_file(key)}');
    if (await file.exists()) await file.delete();
  }

  // 按元数据筛选失效文件，不需要解码所有缓存正文。
  Future<void> removeWhere(
    bool Function(String, Map<String, dynamic>) predicate,
  ) {
    _generation++;
    return _serial(() async {
      for (final key in _index.keys.toList()) {
        if (predicate(key, _index[key]!)) await _delete(key);
      }
    });
  }

  // 清理只作用于当前命名空间，数据与图片存储可分别管理。
  Future<void> clear() => removeWhere((_, _) => true);
  // 容量取索引元数据，设置页不需要读取所有文件内容。
  Future<int> size() async {
    await _queue.catchError((Object _) {});
    await open();
    return _index.values.fold<int>(0, (sum, e) => sum + (e['size'] as int));
  }
}
