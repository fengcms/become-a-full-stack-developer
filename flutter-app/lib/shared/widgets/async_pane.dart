import '../../features/repository.dart';

import 'package:fullstack_reader/app/theme/app_theme.dart';

import 'dart:async';

import 'package:fullstack_reader/core/cache/data_cache.dart';
import 'package:fullstack_reader/shared/cache_visibility.dart';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:fullstack_reader/app/session.dart';
import 'package:fullstack_reader/core/network/api_client.dart';

import 'package:fullstack_reader/shared/widgets/article_skeleton.dart';
import 'package:fullstack_reader/shared/widgets/reader_context.dart';
import 'package:fullstack_reader/shared/widgets/state_message.dart';

/// 保留已展示的数据直到硬过期或无权限，主动刷新时避免整页闪回加载态。
class AsyncPane<T> extends ConsumerStatefulWidget {
  const AsyncPane({
    super.key,
    required this.load,
    required this.builder,
    this.loadKey,
  });
  final Future<T> Function() load;
  final Widget Function(T value, Future<void> Function() reload) builder;
  final Object? loadKey;
  @override
  ConsumerState<AsyncPane<T>> createState() => _AsyncPaneState<T>();
}

class _AsyncPaneState<T> extends ConsumerState<AsyncPane<T>>
    with CacheVisibility<AsyncPane<T>> {
  T? value;
  Object? error;
  bool loading = false;
  int serial = 0;
  Set<String> keys = {};
  StreamSubscription<CacheEvent>? changes;
  @override
  void initState() {
    super.initState();
    changes = ref.read(repositoryProvider).cache.events.listen(onCacheEvent);
    load();
  }

  @override
  void onCacheVisible() {
    if (!loading) load();
  }

  @override
  void didUpdateWidget(covariant AsyncPane<T> old) {
    super.didUpdateWidget(old);
    if (old.loadKey != widget.loadKey) {
      value = null;
      load();
    }
  }

  // 序号隔离重复加载；后发请求胜出，旧结果不覆盖新页面。
  Future<void> load({bool force = false}) async {
    if (loading && !force) return;
    final ticket = ++serial;
    bool superseded = false;
    setState(() => loading = true);
    final nextKeys = <String>{};
    final repo = ref.read(repositoryProvider);
    try {
      final result = await repo.track(
        nextKeys,
        () => force ? repo.force(widget.load) : widget.load(),
      );
      if (mounted && ticket == serial) {
        setState(() {
          value = result;
          error = null;
          keys = nextKeys;
        });
      }
    } catch (e) {
      superseded = e is CacheSuperseded;
      if (mounted &&
          ticket == serial &&
          e is! SessionChanged &&
          e is! CacheSuperseded) {
        setState(() => showLoadError(e, repo, nextKeys));
      }
    } finally {
      if (mounted && ticket == serial) {
        setState(() => loading = false);
        if (superseded && cacheVisible) unawaited(load());
      }
    }
  }

  /// 仅可见页面响应缓存事件；失效和请求失败分别处理，避免重复重载。
  void onCacheEvent(CacheEvent e) {
    if (!mounted || !cacheVisible || (!keys.contains(e.key) && e.key != '*')) {
      return;
    }
    if (e.kind == 'failed' || e.kind == 'removed') {
      setState(() {
        error = e.error;
        if (e.kind == 'removed' ||
            !ref.read(repositoryProvider).cache.usable(e.key)) {
          value = null;
        }
      });
      return;
    }
    if (e.kind == 'cleared') {
      setState(() => value = null);
      unawaited(load(force: true));
      return;
    }
    if (!loading && e.kind != 'patched') unawaited(load());
  }

  // 权限失效和硬过期清空旧值，普通后台错误保留可用内容。
  void showLoadError(Object e, ReaderRepository repo, Set<String> nextKeys) {
    error = e;
    if (repo.forbidden(e) || nextKeys.any((k) => !repo.cache.usable(k))) {
      value = null;
    }
  }

  @override
  void dispose() {
    changes?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (value == null) {
      return error != null
          ? StateMessage(error: error, onRetry: () => load(force: true))
          : const ArticleSkeleton(count: 2);
    }
    final body = widget.builder(value as T, () => load(force: true));
    if (error == null) return body;
    return LayoutBuilder(
      builder: (context, constraints) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: AppInsets.small,
            child: Text('更新失败，当前显示上次内容', style: context.text.bodySmall),
          ),
          if (constraints.hasBoundedHeight) Expanded(child: body) else body,
        ],
      ),
    );
  }
}
