import 'package:fullstack_reader/core/network/endpoints.dart';
import 'package:fullstack_reader/app/theme/app_theme.dart';

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import 'package:fullstack_reader/app/session.dart';
import 'package:fullstack_reader/core/storage/upload.dart';
import 'package:fullstack_reader/shared/widgets/cell_group.dart';
import 'package:fullstack_reader/shared/widgets/menu_cell.dart';
import 'package:fullstack_reader/shared/widgets/notice.dart';
import 'package:fullstack_reader/shared/widgets/page_frame.dart';
import 'package:fullstack_reader/shared/widgets/reader_context.dart';
import 'package:fullstack_reader/shared/widgets/reader_image.dart';
import 'package:fullstack_reader/shared/widgets/section_title.dart';
import 'package:fullstack_reader/shared/widgets/state_message.dart';
import 'package:fullstack_reader/shared/widgets/submit_button.dart';

/// 个人资料和密码修改共用账号上下文，头像上传保留进度和失败提示。
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
      final j = await ref.read(sessionProvider).api.request(Endpoints.profile);
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
          Endpoints.changePassword,
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
          Endpoints.profile,
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
            padding: AppInsets.page,
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
                      padding: AppInsets.page,
                      margin: AppInsets.sectionBottom,
                      decoration: BoxDecoration(
                        border: Border.all(color: context.colors.line),
                        borderRadius: AppRadius.rMd,
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
                                    fontSize: AppType.body,
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
