part of 'profile_page.dart';

/// 昵称和邮箱接收现有控制器，抽离后仍由父级 Form 一次验证。
class _ProfileFields extends StatelessWidget {
  const _ProfileFields({required this.name, required this.email});
  final TextEditingController name;
  final TextEditingController email;
  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
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
              RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(v!.trim())
              ? null
              : '请输入有效邮箱',
        ),
      ],
    );
  }
}
