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
          for (final n in items)
            InkWell(
              onTap: () => mark(n),
              child: Container(
                padding: AppInsets.page,
                decoration: BoxDecoration(
                  color: n.isRead == true
                      ? context.colors.surface
                      : context.colors.brandSubtle,
                  border: Border(
                    bottom: BorderSide(color: context.colors.line),
                  ),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 36,
                      height: 36,
                      decoration: BoxDecoration(
                        color: context.colors.surface,
                        border: Border.all(color: context.colors.line),
                        borderRadius: AppRadius.rMd,
                      ),
                      child: Center(
                        child: PrototypeIcon(
                          'bell',
                          size: 16,
                          color: context.colors.brand,
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  n.title ?? '通知',
                                  style: const TextStyle(
                                    fontSize: AppType.label,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                              if (n.isRead != true)
                                Container(
                                  width: 6,
                                  height: 6,
                                  decoration: BoxDecoration(
                                    color: context.colors.danger,
                                    shape: BoxShape.circle,
                                  ),
                                ),
                            ],
                          ),
                          const SizedBox(height: 5),
                          Text(
                            n.body ?? '',
                            style: TextStyle(
                              fontSize: AppType.caption,
                              height: 1.7,
                              color: context.colors.textMuted,
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            n.createdAt?.split('T').first ?? '',
                            style: context.text.labelSmall,
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          if (error != null) StateMessage(error: error, onRetry: load),
          if (busy) const Center(child: CircularProgressIndicator()),
          if (!busy && more)
            TextButton(onPressed: load, child: const Text('加载更多')),
          if (!busy && items.isEmpty && error == null)
            const StateMessage(
              title: '没有新通知',
              description: '文章发布、评论通过时，会在这里通知你。',
            ),
        ],
      ),
    ),
  );
}
