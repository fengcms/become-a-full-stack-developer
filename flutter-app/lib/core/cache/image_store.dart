import 'package:fullstack_reader/core/cache/cache_limits.dart';

import 'dart:async';
import 'dart:typed_data';
import 'dart:math' as math;

import 'package:dio/dio.dart';

import 'blob_store.dart';

/// 公开无签名图片允许落盘，私有图片仅在当前会话内复用。
class ImageStore {
  ImageStore(this.dio, {BlobStore? disk, this.namespace = ''})
    : disk = disk ?? BlobStore('images', maxBytes: CacheLimits.imageDiskBytes);
  final String namespace;
  final Dio dio;
  final BlobStore disk;
  final _memory = <String, (Uint8List, DateTime)>{};
  final _flights = <String, Future<Uint8List>>{};
  int _generation = 0;
  int _size = 0;
  String key(String url, bool public, int epoch) =>
      '$namespace|${public ? 'public' : 'session:$epoch'}:$url';
  // 含查询参数的链接可能携带签名，不能写入公开图片磁盘缓存。
  bool canPersist(Uri uri, bool public) =>
      public &&
      ['https', 'http'].contains(uri.scheme) &&
      !uri.hasQuery &&
      uri.userInfo.isEmpty;
  // 先复用有效内存和在途请求；会话变化后旧图片请求不能回填。
  Future<Uint8List> load(
    String url, {
    required bool public,
    required int epoch,
    bool force = false,
  }) {
    final k = key(url, public, epoch), generation = _generation;
    final existing = _memory[k];
    if (!force && existing != null && DateTime.now().isBefore(existing.$2)) {
      _memory.remove(k);
      _memory[k] = existing;
      return Future.value(existing.$1);
    }
    if (_flights.containsKey(k)) return _flights[k]!;
    late Future<Uint8List> task;
    task = () async {
      try {
        final persist = canPersist(Uri.parse(url), public);
        if (!force && persist) {
          final bytes = await disk.read(k);
          if (bytes != null && generation == _generation) {
            _put(k, bytes, disk.expiresAt(k) ?? DateTime.now());
            return bytes;
          }
        }
        // 图片请求明确移除鉴权头，避免把 API 令牌发送给图片域名。
        final response = await dio.get<List<int>>(
          url,
          options: Options(
            responseType: ResponseType.bytes,
            headers: {'Authorization': null},
            validateStatus: (s) => s != null && s >= 200 && s < 300,
          ),
        );
        final bytes = Uint8List.fromList(response.data!);
        if (generation != _generation) {
          throw StateError('Image request superseded');
        }
        final control = (response.headers.value('cache-control') ?? '')
            .toLowerCase();
        final storable =
            !control.contains('no-store') && !control.contains('no-cache');
        final maxAge = int.tryParse(
          RegExp(r'(?:^|,)\s*max-age\s*=\s*"?(\d+)')
                  .firstMatch(control)
                  ?.group(1) ??
              '',
        );
        final age = int.tryParse(response.headers.value('age') ?? '') ?? 0;
        final seconds = math.max(0, math.min(7 * 86400, maxAge ?? 86400) - age);
        // 使用响应缓存头和 Age 计算绝对过期时间，磁盘命中沿用原时间。
        final expires = DateTime.now().add(Duration(seconds: seconds));
        if (storable && seconds > 0) {
          _put(k, bytes, expires);
          if (persist &&
              !control.contains('private') &&
              bytes.length <= CacheLimits.imageEntryBytes) {
            unawaited(disk.write(k, bytes, expires));
          }
        } else {
          await disk.removeWhere((key, _) => key == k);
        }
        return bytes;
      } finally {
        if (identical(_flights[k], task)) _flights.remove(k);
      }
    }();
    _flights[k] = task;
    return task;
  }

  // 图片按编码字节计费，超大图片可显示但不保留在应用内存缓存中。
  void _put(String key, Uint8List bytes, DateTime expires) {
    _size -= _memory.remove(key)?.$1.length ?? 0;
    if (bytes.length > CacheLimits.imageEntryBytes) return;
    _memory[key] = (bytes, expires);
    _size += bytes.length;
    while (_size > CacheLimits.imageMemoryBytes ||
        _memory.length > CacheLimits.imageMemoryEntries) {
      _size -= _memory.remove(_memory.keys.first)!.$1.length;
    }
  }

  void trim() {
    _memory.clear();
    _size = 0;
  }

  // 账号切换只移除私有图片，公开图片仍可跨账号复用。
  void resetPrivate() {
    _generation++;
    _flights.clear();
    for (final k
        in _memory.keys
            .where((k) => k.startsWith('$namespace|session:'))
            .toList()) {
      _size -= _memory.remove(k)!.$1.length;
    }
  }

  Future<void> clear() async {
    _generation++;
    trim();
    _flights.clear();
    await disk.clear();
  }
}
