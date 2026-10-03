import 'package:fullstack_reader/core/network/endpoints.dart';
import 'package:fullstack_reader/app/theme/app_theme.dart';

import 'dart:async';

import 'package:fullstack_reader/core/cache/data_cache.dart';
import 'package:fullstack_reader/core/network/api_client.dart';
import 'package:fullstack_reader/shared/cache_visibility.dart';
import 'package:fullstack_reader/shared/prototype_icons.dart';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:fullstack_reader/app/session.dart';
import 'package:fullstack_reader/core/generated/models.dart';
import 'package:fullstack_reader/shared/widgets/notice.dart';
import 'package:fullstack_reader/shared/widgets/page_frame.dart';
import 'package:fullstack_reader/shared/widgets/reader_context.dart';
import 'package:fullstack_reader/shared/widgets/state_message.dart';
import 'package:fullstack_reader/features/data/reader_models.dart';

part 'notification_text.dart';
part 'notification_card.dart';
part 'notification_status.dart';

/// 通知首屏更新时不直接拼接旧分页；已读状态先在当前列表反馈。
class NotificationsPage extends ConsumerStatefulWidget {
  const NotificationsPage({super.key});
  @override
  ConsumerState<NotificationsPage> createState() => _NotificationsPageState();
}

class _NotificationsPageState extends ConsumerState<NotificationsPage>
    with CacheVisibility<NotificationsPage> {
  StreamSubscription<CacheEvent>? changes;
  final dependencies = <String>{};
  bool marking = false;
  @override
  void onCacheVisible() {
    if (!busy && page > 0) load(check: true);
  }

  /// 仅可见页面响应缓存事件；失效和请求失败分别处理，避免重复重载。
  void onCacheEvent(CacheEvent e) {
    if (!mounted ||
        !cacheVisible ||
        busy ||
        marking ||
        (!dependencies.contains(e.key) && e.key != '*')) {
      return;
    }
    if (e.kind == 'failed' || e.kind == 'removed') {
      setState(() {
        error = e.error;
        if (e.kind == 'removed' ||
            !ref.read(repositoryProvider).cache.usable(e.key)) {
          items = [];
        }
      });
      return;
    }
    if (e.kind == 'cleared') {
      setState(() => items = []);
    }
    if (e.kind != 'patched') load(check: true);
  }

  @override
  void dispose() {
    changes?.cancel();
    super.dispose();
  }

  List<ApiNotification> items = [];
  int page = 0;
  bool busy = false, more = true;
  Object? error;
  @override
  void initState() {
    super.initState();
    changes = ref.read(repositoryProvider).cache.events.listen(onCacheEvent);
    load();
  }

  Future<void> load({bool reset = false, bool check = false}) async {
    if (busy) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final repo = ref.read(repositoryProvider);
      if (reset) repo.cache.invalidate({'notifications'});
      final p = PageResult<ApiNotification>.fromJson(
        await repo.track(
          dependencies,
          () => repo.read(
            Endpoints.meNotifications,
            query: {'page': reset || check ? 1 : page + 1, 'pageSize': 20},
            force: reset,
          ),
        ),
        ApiNotification.fromJson,
      );
      if (mounted) {
        setState(() {
          if (reset || check) items = [];
          items.addAll(p.items);
          page = p.page;
          more = p.hasMore;
        });
      }
    } catch (e) {
      if (mounted && e is! CacheSuperseded && e is! SessionChanged) {
        setState(() => error = e);
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> mark(ApiNotification? n) async {
    if (marking) return;
    marking = true;
    final before = List<ApiNotification>.of(items);
    setState(
      () => items = items
          .map(
            (item) => n == null || item.id == n.id
                ? ApiNotification.fromJson({...item.json, 'isRead': true})
                : item,
          )
          .toList(),
    );
    try {
      await ref
          .read(sessionProvider)
          .api
          .request(
            n == null
                ? Endpoints.readAllNotifications
                : Endpoints.notification(n.id!),
            method: n == null ? 'POST' : 'PATCH',
            data: n == null ? null : {'isRead': true},
          );
      if (!mounted) return;
      await load(reset: true);
      ref.invalidate(unreadCountProvider);
      if (n?.link != null && mounted) {
        final path = Uri.tryParse(n!.link!)?.path;
        if (path != null &&
            RegExp(r'^/(articles|members)/[^/]+$').hasMatch(path)) {
          context.push(path);
        }
      }
    } catch (e) {
      if (mounted) {
        setState(() => items = before);
        notice(context, e);
      }
    } finally {
      marking = false;
    }
  }

  @override
  Widget build(BuildContext context) => PageFrame(
    title: '站内通知',
    actions: [
      TextButton(
        onPressed: busy ? null : () => mark(null),
        child: const Text('全部已读'),
      ),
    ],
    child: RefreshIndicator(
      onRefresh: () => load(reset: true),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          for (final n in items) _NotificationCard(n: n, onTap: () => mark(n)),
          _NotificationStatus(
            error: error,
            busy: busy,
            more: more,
            empty: items.isEmpty,
            load: load,
          ),
        ],
      ),
    ),
  );
}
