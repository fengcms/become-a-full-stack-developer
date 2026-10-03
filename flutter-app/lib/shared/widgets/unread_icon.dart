import 'package:fullstack_reader/core/network/endpoints.dart';

import 'dart:async';

import 'package:fullstack_reader/core/cache/data_cache.dart';
import 'package:fullstack_reader/shared/cache_visibility.dart';
import 'package:fullstack_reader/shared/prototype_icons.dart';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:fullstack_reader/app/session.dart';

/// 只在图标可见时校验未读数，账号变化由外层会话边界处理。
class UnreadIcon extends ConsumerStatefulWidget {
  const UnreadIcon(this.icon, {super.key});
  final IconData icon;
  @override
  ConsumerState<UnreadIcon> createState() => _UnreadIconState();
}

class _UnreadIconState extends ConsumerState<UnreadIcon>
    with CacheVisibility<UnreadIcon> {
  StreamSubscription<CacheEvent>? changes;
  @override
  void initState() {
    super.initState();
    changes = ref.read(repositoryProvider).cache.events.listen((e) {
      if (mounted &&
          cacheVisible &&
          (e.key == '*' || e.key.contains(Endpoints.unreadCount)) &&
          e.kind != 'failed' &&
          e.kind != 'patched') {
        ref.invalidate(unreadCountProvider);
      }
    });
  }

  @override
  void onCacheVisible() {
    ref.invalidate(unreadCountProvider);
  }

  @override
  void dispose() {
    changes?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final count = ref.watch(unreadCountProvider).asData?.value ?? 0;
    return Badge(
      isLabelVisible: count > 0,
      label: Text(count > 99 ? '99+' : '$count'),
      child: ReaderIcon(widget.icon),
    );
  }
}
