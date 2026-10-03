part of '../auth_page.dart';

/// 输入控制器由页面持有，切换密码可见性不重置输入；字段仍在同一个 Form 内校验。
class _AuthFields extends StatelessWidget {
  const _AuthFields({
    required this.register,
    required this.username,
    required this.nickname,
    required this.email,
    required this.password,
    required this.obscure,
    required this.toggleObscure,
    required this.submit,
  });
  final bool register;
  final TextEditingController username;
  final TextEditingController nickname;
  final TextEditingController email;
  final TextEditingController password;
  final bool obscure;
  final VoidCallback toggleObscure;
  final VoidCallback submit;
  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextFormField(
          controller: username,
          maxLength: 32,
          autofillHints: const [AutofillHints.username],
          decoration: const InputDecoration(labelText: '用户名'),
          validator: (v) => v!.trim().isEmpty ? '请输入用户名' : null,
        ),
        if (register) ...[
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
            register ? AutofillHints.newPassword : AutofillHints.password,
          ],
          decoration: InputDecoration(
            labelText: '密码',
            helperText: '至少 8 个字符',
            suffixIcon: IconButton(
              tooltip: obscure ? '显示密码' : '隐藏密码',
              onPressed: toggleObscure,
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
      ],
    );
  }
}
