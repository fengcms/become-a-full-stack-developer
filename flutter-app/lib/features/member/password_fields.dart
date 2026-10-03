part of 'profile_page.dart';

/// 当前与新密码共用资料页 Form 的校验，组件不执行密码修改请求。
class _PasswordFields extends StatelessWidget {
  const _PasswordFields({required this.oldPassword, required this.newPassword});
  final TextEditingController oldPassword;
  final TextEditingController newPassword;
  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
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
      ],
    );
  }
}
