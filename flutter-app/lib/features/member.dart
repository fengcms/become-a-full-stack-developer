import 'dart:async';

import '../core/cache/data_cache.dart';
import '../core/network/api_client.dart';
import '../shared/cache_visibility.dart';
import '../shared/prototype_icons.dart';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../app/session.dart';
import '../core/generated/models.dart';
import '../core/storage/upload.dart';
import '../shared/widgets.dart';
import 'repository.dart';

Future<void> chooseTheme(BuildContext context, WidgetRef ref) =>
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (c) => Consumer(
        builder: (c, ref, _) => SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('外观设置', style: c.text.titleLarge),
              for (final mode in ThemeMode.values)
                ListTile(
                  leading: ReaderIcon(switch (mode) {
                    ThemeMode.system => Icons.brightness_auto_outlined,
                    ThemeMode.light => Icons.light_mode_outlined,
                    ThemeMode.dark => Icons.dark_mode_outlined,
                  }),
                  title: Text(switch (mode) {
                    ThemeMode.system => '跟随系统',
                    ThemeMode.light => '浅色模式',
                    ThemeMode.dark => '深色模式',
                  }),
                  trailing: ref.watch(sessionProvider).mode == mode
                      ? const ReaderIcon(Icons.check)
                      : null,
                  onTap: () {
                    ref.read(sessionProvider).setTheme(mode);
                    Navigator.pop(c);
                  },
                ),
            ],
          ),
        ),
      ),
    );

class MemberPage extends ConsumerWidget {
  const MemberPage({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider), user = session.user;
    Widget content(Map<String, dynamic>? data) => ListView(
      children: [
        Container(
          margin: const EdgeInsets.all(16),
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            gradient: context.colors.heroWash,
            border: Border.all(color: context.colors.line),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Row(
            children: [
              CircleAvatar(
                radius: 28,
                backgroundColor: context.colors.brandSubtle,
                foregroundColor: context.colors.brandOnSubtle,
                child: user?.avatar?.isNotEmpty == true
                    ? ClipOval(
                        child: ReaderImage(
                          user!.avatar!,
                          width: 56,
                          height: 56,
                        ),
                      )
                    : Text(
                        (user?.nickname?.isNotEmpty == true
                                ? user!.nickname!
                                : '读者')
                            .characters
                            .first,
                        style: const TextStyle(fontSize: 22),
                      ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      user?.nickname ?? '欢迎来到成为全栈',
                      style: TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w600,
                        color: context.colors.textTitle,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      user == null
                          ? '登录后可以收藏、评论和投稿'
                          : 'Lv.${user.level ?? 1} · 会员 · @${user.username}',
                      style: const TextStyle(fontSize: 11.5),
                    ),
                  ],
                ),
              ),
              if (user != null)
                IconButton(
                  onPressed: () => context.push('/member/profile'),
                  icon: const PrototypeIcon('chevr'),
                ),
            ],
          ),
        ),
        if (user == null)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: FilledButton(
              onPressed: () => context.push('/login'),
              child: const Text('登录 / 注册'),
            ),
          ),
        if (user != null)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                for (var i = 0; i < 4; i++)
                  Expanded(
                    child: Container(
                      margin: EdgeInsets.only(right: i == 3 ? 0 : 12),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        border: Border.all(color: context.colors.line),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Column(
                        children: [
                          Text(
                            data == null ? '—' : '${data['counts'][i]}',
                            style: const TextStyle(
                              fontFamily: 'monospace',
                              fontSize: 18,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          Text(
                            ['收藏', '点赞', '足迹', '稿件'][i],
                            style: context.text.labelSmall,
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),
        CellGroup(
          children: [
            for (final item in [
              ('我的收藏', 'star', 'favorites', '收藏值得重读的文章'),
              ('我的点赞', 'heart', 'likes', '记录喜欢的内容'),
              ('阅读历史', 'clockback', 'history', '继续上次的阅读'),
              ('我的文章', 'pen', 'articles', '草稿与已提交稿件'),
              ('通知', 'bell', 'notifications', '收藏、评论与审核结果'),
            ])
              MenuCell(
                item.$1,
                item.$2,
                subtitle: item.$4,
                onTap: () => context.push('/member/${item.$3}'),
              ),
          ],
        ),
        CellGroup(
          children: [
            MenuCell(
              '个人资料',
              'user',
              subtitle: '头像、昵称与邮箱',
              onTap: () => context.push('/member/profile'),
            ),
            MenuCell(
              '设置',
              'cog',
              subtitle: '外观、账号与退出登录',
              onTap: () => context.push('/member/settings'),
            ),
          ],
        ),
        if (user != null) ...[
          SectionTitle(
            '继续阅读',
            action: '历史',
            onTap: () => context.push('/member/history'),
          ),
          if (data != null && (data['history'] as List).isEmpty)
            const Padding(
              padding: EdgeInsets.all(16),
              child: Text('还没有阅读记录，去首页看看吧。'),
            ),
          if (data != null)
            for (final item in data['history'])
              ArticleTile(Article.fromJson(jsonMap(item['article']))),
        ],
        CellGroup(
          children: [
            MenuCell(
              '写一篇文章',
              'plus',
              subtitle: '草稿会按账号隔离保存在本机',
              onTap: () => context.push('/member/articles/new'),
            ),
          ],
        ),
        const SizedBox(height: 24),
      ],
    );
    return PageFrame(
      title: '我的',
      actions: [
        IconButton(
          tooltip: '通知',
          onPressed: () => context.push('/member/notifications'),
          icon: const UnreadIcon(Icons.notifications_none),
        ),
        IconButton(
          tooltip: '设置',
          onPressed: () => context.push('/member/settings'),
          icon: const PrototypeIcon('cog'),
        ),
      ],
      child: user == null
          ? content(null)
          : AsyncPane<Map<String, dynamic>>(
              key: ValueKey(session.epoch),
              load: ref.read(repositoryProvider).overview,
              builder: (data, reload) =>
                  RefreshIndicator(onRefresh: reload, child: content(data)),
            ),
    );
  }
}

class SettingsPage extends ConsumerWidget {
  const SettingsPage({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider);
    return PageFrame(
      title: '设置',
      child: ListView(
        children: [
          const SectionTitle('外观'),
          CellGroup(
            children: [
              for (final item in [
                (ThemeMode.system, '跟随系统', 'cog', '随系统的浅色 / 深色自动切换'),
                (ThemeMode.light, '浅色', 'sun', '白色内容面、深蓝灰文字'),
                (ThemeMode.dark, '深色', 'moon', '深蓝灰背景、低亮度蓝色强调'),
              ])
                MenuCell(
                  item.$2,
                  item.$3,
                  subtitle: item.$4,
                  onTap: () => session.setTheme(item.$1),
                  trailing: Container(
                    width: 18,
                    height: 18,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: session.mode == item.$1
                            ? context.colors.brand
                            : context.colors.lineStrong,
                        width: session.mode == item.$1 ? 5 : 1,
                      ),
                    ),
                  ),
                ),
            ],
          ),
          const SectionTitle('账号'),
          CellGroup(
            children: [
              MenuCell(
                '个人资料',
                'user',
                subtitle: '头像、昵称与邮箱',
                onTap: () => context.push('/member/profile'),
              ),
              MenuCell(
                '修改密码',
                'lock',
                subtitle: '修改后需要重新登录',
                onTap: () => context.push('/member/password'),
              ),
              if (session.user != null)
                MenuCell(
                  '退出登录',
                  'logout',
                  danger: true,
                  subtitle: '清除本机登录状态与私有缓存',
                  onTap: () async {
                    if (!await confirm(
                      context,
                      '退出登录',
                      '退出后将清除本机会话，已保存的稿件不受影响。',
                    )) {
                      return;
                    }
                    try {
                      await session.logout();
                      if (context.mounted) context.go('/member');
                    } catch (e) {
                      if (context.mounted) notice(context, e);
                    }
                  },
                ),
            ],
          ),
          const SectionTitle('存储'),
          CellGroup(
            children: [
              AsyncPane<int>(
                load: ref.read(repositoryProvider).cacheBytes,
                builder: (bytes, reload) => MenuCell(
                  '清理缓存',
                  'refresh',
                  subtitle:
                      '${(bytes / 1024 / 1024).toStringAsFixed(1)} MB · 保留登录、草稿、主题和搜索历史',
                  onTap: () async {
                    await ref.read(repositoryProvider).clear();
                    PaintingBinding.instance.imageCache.clear();
                    PaintingBinding.instance.imageCache.clearLiveImages();
                    await reload();
                    if (context.mounted) notice(context, '缓存已清理');
                  },
                ),
              ),
            ],
          ),
          const SectionTitle('关于'),
          const CellGroup(
            children: [
              MenuCell(
                '版本',
                'layers',
                trailing: Text('v1.0.0', style: TextStyle(fontSize: 13)),
              ),
            ],
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}

class MemberArticlesPage extends ConsumerStatefulWidget {
  const MemberArticlesPage({super.key});
  @override
  ConsumerState<MemberArticlesPage> createState() => _MemberArticlesPageState();
}

class _MemberArticlesPageState extends ConsumerState<MemberArticlesPage> {
  String status = '';
  int revision = 0;
  Future<void> edit(String route) async {
    await context.push(route);
    // Repository mutation events refresh only when something actually changed.
  }

  @override
  Widget build(BuildContext context) => PageFrame(
    title: '我的文章',
    actions: [
      IconButton(
        tooltip: '写文章',
        onPressed: () => edit('/member/articles/new'),
        icon: const ReaderIcon(Icons.add),
      ),
    ],
    child: Column(
      children: [
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              for (final e in {
                '': '全部',
                'draft': '草稿',
                'pending': '待审核',
                'published': '已发布',
              }.entries)
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    label: Text(e.value),
                    selected: status == e.key,
                    onSelected: (_) => setState(() => status = e.key),
                  ),
                ),
            ],
          ),
        ),
        Expanded(
          child: ArticleFeed(
            key: ValueKey(
              '$status-$revision-${ref.watch(sessionProvider).epoch}',
            ),
            path: '/me/articles',
            query: {if (status.isNotEmpty) 'status': status},
            showStatus: true,
            onArticle: (a) => edit('/member/articles/${a.id}/edit'),
            itemBuilder: (a, reload) => DraftTile(
              a,
              onEdit: () => edit('/member/articles/${a.id}/edit'),
              reload: reload,
            ),
          ),
        ),
      ],
    ),
  );
}

class DraftTile extends ConsumerStatefulWidget {
  const DraftTile(
    this.article, {
    super.key,
    required this.onEdit,
    required this.reload,
  });
  final Article article;
  final VoidCallback onEdit, reload;
  @override
  ConsumerState<DraftTile> createState() => _DraftTileState();
}

class _DraftTileState extends ConsumerState<DraftTile> {
  bool busy = false;
  Future<void> mutate(bool submit) async {
    if (busy) return;
    if (!await confirm(
      context,
      submit ? '提交审核' : '删除稿件',
      submit ? '提交后进入待审核状态，仍可继续编辑。' : '删除“${widget.article.title}”后不可恢复。',
    )) {
      return;
    }
    setState(() => busy = true);
    try {
      await ref
          .read(sessionProvider)
          .api
          .request(
            '/articles/${widget.article.id}${submit ? '/submit' : ''}',
            method: submit ? 'POST' : 'DELETE',
          );
      widget.reload();
    } catch (e) {
      if (mounted) notice(context, e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final a = widget.article;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: context.colors.line)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              StatusBadge(a.status),
              const SizedBox(width: 8),
              Text(
                '${a.data.updatedAt?.split('T').first ?? ''} 更新',
                style: context.text.labelSmall,
              ),
            ],
          ),
          const SizedBox(height: 8),
          InkWell(
            onTap: widget.onEdit,
            child: Text(
              a.title,
              style: TextStyle(
                fontSize: 15.5,
                height: 1.5,
                fontWeight: FontWeight.w600,
                color: context.colors.textTitle,
              ),
            ),
          ),
          if (a.data.summary?.isNotEmpty == true)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                a.data.summary!,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 12.5,
                  height: 1.65,
                  color: context.colors.textMuted,
                ),
              ),
            ),
          if (a.status == 'pending')
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Text(
                '审核中，可以继续编辑',
                style: TextStyle(fontSize: 11, color: context.colors.warning),
              ),
            ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              OutlinedButton(
                onPressed: busy ? null : widget.onEdit,
                child: Text(a.status == 'published' ? '修改' : '编辑'),
              ),
              OutlinedButton(
                onPressed: () => context.push(
                  a.status == 'published'
                      ? '/articles/${a.route}'
                      : '/member/articles/${a.id}/preview',
                ),
                child: Text(a.status == 'published' ? '查看' : '预览'),
              ),
              if (a.status == 'draft')
                FilledButton(
                  onPressed: busy ? null : () => mutate(true),
                  child: const Text('提交审核'),
                ),
              if (a.status != 'published')
                TextButton(
                  onPressed: busy ? null : () => mutate(false),
                  child: Text(
                    '删除',
                    style: TextStyle(color: context.colors.danger),
                  ),
                ),
            ],
          ),
          if (busy) const LinearProgressIndicator(),
        ],
      ),
    );
  }
}

class MemberListPage extends ConsumerStatefulWidget {
  const MemberListPage(this.kind, {super.key});
  final String kind;
  @override
  ConsumerState<MemberListPage> createState() => _MemberListPageState();
}

class _MemberListPageState extends ConsumerState<MemberListPage> {
  String get kind => widget.kind;
  int revision = 0;
  @override
  Widget build(BuildContext context) {
    final label =
        {'favorites': '我的收藏', 'likes': '我的点赞', 'history': '阅读历史'}[kind] ??
        '我的内容';
    return PageFrame(
      title: label,
      actions: [
        if (kind == 'history')
          TextButton(
            onPressed: () async {
              if (!await confirm(context, '清空阅读历史', '将移除当前账号全部阅读记录。')) return;
              try {
                await ref
                    .read(sessionProvider)
                    .api
                    .request('/me/history', method: 'DELETE');
                if (mounted) setState(() => revision++);
              } catch (e) {
                if (context.mounted) notice(context, e);
              }
            },
            child: const Text('清空'),
          ),
      ],
      child: ArticleFeed(
        key: ValueKey('$kind-$revision-${ref.watch(sessionProvider).epoch}'),
        path: '/me/$kind',
        trailing: (a, reload) => IconButton(
          tooltip: kind == 'likes' ? '取消点赞' : '移除记录',
          icon: const ReaderIcon(Icons.close, size: 18),
          onPressed: () async {
            if (!await confirm(
              context,
              kind == 'history'
                  ? '移除阅读记录'
                  : '取消${kind == 'likes' ? '点赞' : '收藏'}',
              a.title,
            )) {
              return;
            }
            try {
              await ref
                  .read(sessionProvider)
                  .api
                  .request(
                    kind == 'likes'
                        ? '/articles/${a.id}/like'
                        : '/me/$kind/${a.id}',
                    method: 'DELETE',
                  );
              reload();
            } catch (e) {
              if (context.mounted) notice(context, e);
            }
          },
        ),
      ),
    );
  }
}

class ProfilePage extends ConsumerStatefulWidget {
  const ProfilePage({super.key, this.passwordMode = false});
  final bool passwordMode;
  @override
  ConsumerState<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends ConsumerState<ProfilePage> {
  final form = GlobalKey<FormState>();
  final name = TextEditingController(),
      email = TextEditingController(),
      oldPassword = TextEditingController(),
      newPassword = TextEditingController();
  String? avatar;
  bool busy = false, loaded = false;
  Object? error;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    if (widget.passwordMode) {
      setState(() => loaded = true);
      return;
    }
    try {
      final j = await ref.read(sessionProvider).api.request('/me/profile');
      if (!mounted) return;
      name.text = j['nickname'] ?? '';
      email.text = j['email'] ?? '';
      setState(() {
        avatar = j['avatar'];
        loaded = true;
      });
    } catch (e) {
      if (mounted) setState(() => error = e);
    }
  }

  @override
  void dispose() {
    for (final c in [name, email, oldPassword, newPassword]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> save() async {
    if (!form.currentState!.validate()) return;
    setState(() => busy = true);
    try {
      final s = ref.read(sessionProvider);
      if (widget.passwordMode) {
        await s.api.request(
          '/me/change-password',
          method: 'POST',
          data: {
            'oldPassword': oldPassword.text,
            'newPassword': newPassword.text,
          },
        );
        await s.expire();
        if (mounted) {
          notice(context, '密码已修改，请重新登录');
          context.go('/login');
        }
      } else {
        await s.api.request(
          '/me/profile',
          method: 'PATCH',
          data: {
            'nickname': name.text.trim(),
            'email': email.text.trim(),
            'avatar': avatar,
          },
        );
        await s.reloadUser();
        if (mounted) notice(context, '资料已保存');
      }
    } catch (e) {
      if (mounted) notice(context, e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> photo() async {
    try {
      final picked = await ImagePicker().pickImage(source: ImageSource.gallery);
      if (picked == null) return;
      setState(() => busy = true);
      final url = await uploadImage(ref.read(sessionProvider).api, picked);
      if (mounted) setState(() => avatar = url);
    } catch (e) {
      if (mounted) notice(context, e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => PageFrame(
    title: widget.passwordMode ? '修改密码' : '个人资料',
    child: !loaded
        ? (error == null
              ? const Center(child: CircularProgressIndicator())
              : StateMessage(error: error, onRetry: load))
        : SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Form(
              key: form,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (widget.passwordMode) ...[
                    TextFormField(
                      controller: oldPassword,
                      obscureText: true,
                      decoration: const InputDecoration(labelText: '当前密码'),
                      validator: (v) => v!.length < 8 ? '至少 8 个字符' : null,
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: newPassword,
                      obscureText: true,
                      decoration: const InputDecoration(labelText: '新密码'),
                      validator: (v) => v!.length < 8 ? '至少 8 个字符' : null,
                    ),
                    const SizedBox(height: 16),
                    const Text('修改后需要重新登录。'),
                  ] else ...[
                    Container(
                      padding: const EdgeInsets.all(16),
                      margin: const EdgeInsets.only(bottom: 16),
                      decoration: BoxDecoration(
                        border: Border.all(color: context.colors.line),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(
                        children: [
                          CircleAvatar(
                            radius: 28,
                            backgroundColor: context.colors.brandSubtle,
                            foregroundColor: context.colors.brandOnSubtle,
                            child: avatar?.isNotEmpty == true
                                ? ClipOval(
                                    child: ReaderImage(
                                      avatar!,
                                      width: 56,
                                      height: 56,
                                    ),
                                  )
                                : Text(
                                    name.text.isEmpty
                                        ? '读'
                                        : name.text.characters.first,
                                  ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  name.text,
                                  style: const TextStyle(
                                    fontSize: 15,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                                Text(
                                  '@${ref.read(sessionProvider).user?.username ?? ""}',
                                  style: context.text.labelSmall,
                                ),
                              ],
                            ),
                          ),
                          TextButton(
                            onPressed: busy ? null : photo,
                            child: const Text('更换头像'),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: name,
                      maxLength: 32,
                      decoration: const InputDecoration(labelText: '昵称'),
                      validator: (v) => v!.trim().isEmpty ? '请输入昵称' : null,
                    ),
                    TextFormField(
                      controller: email,
                      keyboardType: TextInputType.emailAddress,
                      decoration: const InputDecoration(labelText: '邮箱'),
                      validator: (v) =>
                          RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')
                              .hasMatch(v!.trim())
                          ? null
                          : '请输入有效邮箱',
                    ),
                  ],
                  const SizedBox(height: 24),
                  SubmitButton(label: '保存修改', busy: busy, onPressed: save),
                  if (!widget.passwordMode) ...[
                    const SectionTitle('账号信息'),
                    CellGroup(
                      children: [
                        MenuCell(
                          '用户名',
                          'user',
                          subtitle: '注册后不可修改',
                          trailing: Text(
                            '@${ref.read(sessionProvider).user?.username ?? ""}',
                            style: context.text.bodySmall,
                          ),
                        ),
                        MenuCell(
                          '会员等级',
                          'star',
                          subtitle: '由管理员调整',
                          trailing: Text(
                            'Lv.${ref.read(sessionProvider).user?.level ?? 1}',
                            style: context.text.bodySmall,
                          ),
                        ),
                        MenuCell(
                          '注册时间',
                          'clock',
                          trailing: Text(
                            ref
                                    .read(sessionProvider)
                                    .user
                                    ?.createdAt
                                    ?.split('T')
                                    .first ??
                                '',
                            style: context.text.bodySmall,
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ),
  );
}

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
    changes = ref.read(repositoryProvider).cache.events.listen((e) {
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
    });
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
            '/me/notifications',
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
                ? '/me/notifications/read-all'
                : '/me/notifications/${n.id}',
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
                padding: const EdgeInsets.all(16),
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
                        borderRadius: BorderRadius.circular(8),
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
                                    fontSize: 14,
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
                              fontSize: 13,
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
