part of 'settings_page.dart';

/// 退出时清理会话与私有缓存，本机稿件仍按账号保留。
class _AccountOptions extends StatelessWidget {
  const _AccountOptions({required this.session});
  final AppSession session;
  @override
  Widget build(BuildContext context) => CellGroup(
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
            if (!await confirm(context, '退出登录', '退出后将清除本机会话，已保存的稿件不受影响。')) {
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
  );
}
