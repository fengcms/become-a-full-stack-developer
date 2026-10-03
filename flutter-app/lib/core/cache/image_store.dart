import 'dart:async';
import 'dart:typed_data';
import 'dart:math' as math;

import 'package:dio/dio.dart';

import 'blob_store.dart';

class ImageStore {
  ImageStore(this.dio, {BlobStore? disk, this.namespace = ''})
    : disk = disk ?? BlobStore('images', maxBytes: 150 * 1024 * 1024);
  final String namespace;
  final Dio dio;
  final BlobStore disk;
  final _memory = <String, (Uint8List, DateTime)>{};
  final _flights = <String, Future<Uint8List>>{};
  int _generation = 0;
  int _size = 0;
  String key(String url, bool public, int epoch) =>
      '$namespace|${public ? 'public' : 'session:$epoch'}:$url';
  bool canPersist(Uri uri, bool public) =>
      public &&
      ['https', 'http'].contains(uri.scheme) &&
      !uri.hasQuery &&
      uri.userInfo.isEmpty;
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
        final expires = DateTime.now().add(Duration(seconds: seconds));
        if (storable && seconds > 0) {
          _put(k, bytes, expires);
          if (persist &&
              !control.contains('private') &&
              bytes.length <= 10 * 1024 * 1024) {
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

  void _put(String key, Uint8List bytes, DateTime expires) {
    _size -= _memory.remove(key)?.$1.length ?? 0;
    if (bytes.length > 10 * 1024 * 1024) return;
    _memory[key] = (bytes, expires);
    _size += bytes.length;
    while (_size > 20 * 1024 * 1024 || _memory.length > 100) {
      _size -= _memory.remove(_memory.keys.first)!.$1.length;
    }
  }

  void trim() {
    _memory.clear();
    _size = 0;
  }

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
