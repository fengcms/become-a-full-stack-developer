part of '../auth_page.dart';

/// 提交错误、忙碌按钮和模式切换共用状态；保留来源路径供认证后回跳。
class _AuthActions extends StatelessWidget {
  const _AuthActions({
    required this.error,
    required this.register,
    required this.busy,
    required this.from,
    required this.submit,
  });
  final String? error;
  final bool register;
  final bool busy;
  final String from;
  final VoidCallback submit;
  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (error != null)
          Padding(
            padding: AppInsets.sectionVertical,
            child: Text(error!, style: TextStyle(color: context.colors.danger)),
          ),
        const SizedBox(height: 24),
        SubmitButton(
          label: register ? '注册并登录' : '登录',
          busy: busy,
          onPressed: submit,
        ),
        TextButton(
          onPressed: busy
              ? null
              : () => context.go(
                  '${register ? '/login' : '/register'}?from=${Uri.encodeComponent(from)}',
                ),
          child: Text(register ? '已有账号，去登录' : '还没有账号？注册会员'),
        ),
      ],
    );
  }
}
