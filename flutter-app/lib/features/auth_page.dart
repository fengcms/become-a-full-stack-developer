import 'package:fullstack_reader/app/theme/app_theme.dart';

import '../shared/prototype_icons.dart';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../app/session.dart';

import 'package:fullstack_reader/shared/widgets/page_frame.dart';
import 'package:fullstack_reader/shared/widgets/reader_context.dart';
import 'package:fullstack_reader/shared/widgets/submit_button.dart';

/// 登录与注册共用校验和返回目标，成功后由会话边界重建会员页面。
class AuthPage extends ConsumerStatefulWidget {
  const AuthPage({super.key, this.register = false, this.from = '/member'});
  final bool register;
  final String from;
  @override
  ConsumerState<AuthPage> createState() => _AuthPageState();
}

class _AuthPageState extends ConsumerState<AuthPage> {
  final form = GlobalKey<FormState>();
  final username = TextEditingController(),
      password = TextEditingController(),
      email = TextEditingController(),
      nickname = TextEditingController();
  bool busy = false, obscure = true;
  String? error;
  @override
  void dispose() {
    for (final c in [username, password, email, nickname]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> submit() async {
    if (!form.currentState!.validate()) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await ref.read(sessionProvider).authenticate({
        'username': username.text.trim(),
        'password': password.text,
        if (widget.register) 'email': email.text.trim(),
        if (widget.register) 'nickname': nickname.text.trim(),
      }, register: widget.register);
      if (mounted) {
        final from = widget.from;
        context.go(
          from.startsWith('/') &&
                  !from.startsWith('//') &&
                  !from.startsWith('/login') &&
                  !from.startsWith('/register')
              ? from
              : '/member',
        );
      }
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => PageFrame(
    title: '',
    child: SingleChildScrollView(
      padding: AppInsets.welcome,
      child: AutofillGroup(
        child: Form(
          key: form,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Align(
                alignment: Alignment.centerLeft,
                child: Container(
                  padding: AppInsets.tinyBadge,
                  decoration: BoxDecoration(
                    color: context.colors.brandSubtle,
                    borderRadius: AppRadius.rXs,
                  ),
                  child: Text(
                    '{ }',
                    style: TextStyle(
                      fontFamily: 'monospace',
                      fontSize: AppType.body,
                      fontWeight: FontWeight.w700,
                      color: context.colors.brandOnSubtle,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Text(
                widget.register ? '注册' : '登录',
                style: TextStyle(
                  fontSize: AppType.h1,
                  fontWeight: FontWeight.w700,
                  color: context.colors.textTitle,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                widget.register ? '注册后默认为普通会员，可以投稿。' : '登录后可以收藏、评论和投稿。',
                style: TextStyle(
                  fontSize: AppType.listSummary,
                  height: 1.65,
                  color: context.colors.textMuted,
                ),
              ),
              const SizedBox(height: 20),
              TextFormField(
                controller: username,
                maxLength: 32,
                autofillHints: const [AutofillHints.username],
                decoration: const InputDecoration(labelText: '用户名'),
                validator: (v) => v!.trim().isEmpty ? '请输入用户名' : null,
              ),
              if (widget.register) ...[
                TextFormField(
                  controller: nickname,
                  maxLength: 32,
                  decoration: const InputDecoration(labelText: '昵称（选填）'),
                ),
                TextFormField(
                  controller: email,
                  keyboardType: TextInputType.emailAddress,
                  autofillHints: const [AutofillHints.email],
                  decoration: const InputDecoration(labelText: '邮箱'),
                  validator: (v) =>
                      RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(v!.trim())
                      ? null
                      : '请输入有效邮箱',
                ),
                const SizedBox(height: 16),
              ],
              TextFormField(
                controller: password,
                obscureText: obscure,
                autofillHints: [
                  widget.register
                      ? AutofillHints.newPassword
                      : AutofillHints.password,
                ],
                decoration: InputDecoration(
                  labelText: '密码',
                  helperText: '至少 8 个字符',
                  suffixIcon: IconButton(
                    tooltip: obscure ? '显示密码' : '隐藏密码',
                    onPressed: () => setState(() => obscure = !obscure),
                    icon: ReaderIcon(
                      obscure
                          ? Icons.visibility_outlined
                          : Icons.visibility_off_outlined,
                    ),
                  ),
                ),
                validator: (v) => v!.length < 8 ? '密码至少 8 个字符' : null,
                onFieldSubmitted: (_) => submit(),
              ),
              if (error != null)
                Padding(
                  padding: AppInsets.sectionVertical,
                  child: Text(
                    error!,
                    style: TextStyle(color: context.colors.danger),
                  ),
                ),
              const SizedBox(height: 24),
              SubmitButton(
                label: widget.register ? '注册并登录' : '登录',
                busy: busy,
                onPressed: submit,
              ),
              TextButton(
                onPressed: busy
                    ? null
                    : () => context.go(
                        '${widget.register ? '/login' : '/register'}?from=${Uri.encodeComponent(widget.from)}',
                      ),
                child: Text(widget.register ? '已有账号，去登录' : '还没有账号？注册会员'),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}
