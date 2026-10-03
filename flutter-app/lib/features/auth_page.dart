import 'package:fullstack_reader/app/theme/app_theme.dart';

import '../shared/prototype_icons.dart';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../app/session.dart';

import 'package:fullstack_reader/shared/widgets/page_frame.dart';
import 'package:fullstack_reader/shared/widgets/reader_context.dart';
import 'package:fullstack_reader/shared/widgets/submit_button.dart';

part 'auth/auth_intro.dart';
part 'auth/auth_fields.dart';
part 'auth/auth_actions.dart';

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
              _AuthIntro(register: widget.register),
              _AuthFields(
                register: widget.register,
                username: username,
                nickname: nickname,
                email: email,
                password: password,
                obscure: obscure,
                toggleObscure: () => setState(() => obscure = !obscure),
                submit: submit,
              ),
              _AuthActions(
                error: error,
                register: widget.register,
                busy: busy,
                from: widget.from,
                submit: submit,
              ),
            ],
          ),
        ),
      ),
    ),
  );
}
