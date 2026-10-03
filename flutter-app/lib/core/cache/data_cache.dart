import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'blob_store.dart';

class CachePolicy {
  const CachePolicy(this.fresh, this.maxAge, {this.disk = false});
  final Duration fresh, maxAge;
  final bool disk;
}

class CacheReply {
  CacheReply(this.value, {this.control = '', this.age = Duration.zero});
  final dynamic value;
  final String control;
  final Duration age;
}

class CacheEvent {
  const CacheEvent(this.key, this.kind, {this.error});
  final String key, kind;
  final Object? error;
}

class CacheSuperseded implements Exception {}

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

/// Explicit repository policies only; raw network calls are never cached.
class DataCache {
  DataCache({
    BlobStore? disk,
    DateTime Function()? clock,
    this.maxEntries = 300,
    this.maxBytes = 20 * 1024 * 1024,
  }) : disk =
           disk ??
           BlobStore('data', maxBytes: 30 * 1024 * 1024, maxEntries: 300),
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

  void _put(String key, CacheEntry entry) {
    _entries.remove(key);
    _entries[key] = entry;
    for (final rule in {'articleBodies': 100, '/search': 20}.entries) {
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

  dynamic peek(String key) {
    final e = _entries[key];
    return e != null && now().difference(e.saved) < e.maxAge ? e.value : null;
  }

  DateTime? savedAt(String key) => _entries[key]?.saved;
  bool usable(String key) => peek(key) != null;
  bool fresh(String key) {
    final e = _entries[key];
    return e != null &&
        now().difference(e.saved) >= Duration.zero &&
        now().difference(e.saved) < e.fresh;
  }

  Future<dynamic> get(
    String key,
    CachePolicy policy,
    Future<CacheReply> Function() fetch, {
    bool force = false,
    Set<String> tags = const {},
    bool Function(Object)? forbidden,
  }) async {
    _keyTags[key] = tags;
    if (_keyTags.length > 1000) {
      for (final old in _keyTags.keys.toList()) {
        if (_keyTags.length <= 1000) break;
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
        final control = response.control.toLowerCase();
        final noStore = control.contains('no-store');
        var fresh = policy.fresh;
        var max = policy.maxAge;
        final maxSeconds = int.tryParse(
          RegExp(r'(?:^|,)\s*max-age\s*=\s*"?(\d+)')
                  .firstMatch(control)
                  ?.group(1) ??
              '',
        );
        if (maxSeconds != null) {
          final age = Duration(seconds: maxSeconds);
          if (age < fresh) fresh = age;
          if (age < max) max = age;
        }
        if (control.contains('no-cache')) {
          fresh = Duration.zero;
          max = Duration.zero;
        }
        if (control.contains('must-revalidate') && fresh < max) max = fresh;
        final entry = CacheEntry(
          response.value,
          now().subtract(response.age),
          fresh,
          max,
          tags,
        );
        if (!noStore && max > Duration.zero) {
          _put(key, entry);
          if (policy.disk &&
              !control.contains('private') &&
              entry.bytes <= 2 * 1024 * 1024) {
            unawaited(
              disk.write(
                key,
                Uint8List.fromList(utf8.encode(jsonEncode(entry.toJson()))),
                entry.saved.add(max),
                metadata: {
                  'tags': tags.toList(),
                  if (tags.contains('articleBodies') &&
                      response.value is Map &&
                      response.value['article'] is Map)
                    'aliases': [
                      '${response.value['article']['id']}',
                      if (response.value['article']['slug'] is String)
                        response.value['article']['slug'],
                    ],
                },
              ),
            );
          }
        } else {
          _entries.remove(key);
          unawaited(disk.removeWhere((k, _) => k == key));
        }
        if (!noStore && max > Duration.zero) emit(CacheEvent(key, 'updated'));
        return response.value;
      } catch (e) {
        if (epoch == _epoch &&
            version == (_version(key)) &&
            e is! CacheSuperseded) {
          if (forbidden?.call(e) == true) {
            _entries.remove(key);
            unawaited(disk.removeWhere((k, _) => k == key));
            emit(CacheEvent(key, 'removed', error: e));
          } else {
            emit(CacheEvent(key, 'failed', error: e));
          }
        }
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

  /// Fence reads at mutation start; preserve visible data until its outcome.
  void fence(Set<String> tags) {
    for (final key in _keyTags.keys.toList()) {
      if (_keyTags[key]!.intersection(tags).isNotEmpty) {
        _versions[key] = Object();
        _flights.remove(key);
      }
    }
  }

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

  void seed(String key, dynamic value, CachePolicy policy, Set<String> tags) {
    _keyTags[key] = tags;
    _put(key, CacheEntry(value, now(), policy.fresh, policy.maxAge, tags));
  }

  void patch(dynamic Function(dynamic) transform) {
    for (final key in _entries.keys.toList()) {
      _entries[key]!.value = transform(_entries[key]!.value);
      emit(CacheEvent(key, 'patched'));
    }
  }

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

  void trim() {
    _entries.clear();
  }

  void close() {
    _epoch++;
    _events.close();
  }
}
