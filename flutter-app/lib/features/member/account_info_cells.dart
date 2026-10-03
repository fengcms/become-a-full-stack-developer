part of 'profile_page.dart';

/// 账号信息只展示不可编辑字段，避免与资料表单的可修改字段混淆。
class _AccountInfoCells extends StatelessWidget {
  const _AccountInfoCells({
    required this.username,
    required this.level,
    required this.createdAt,
  });
  final String username;
  final int level;
  final String createdAt;
  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SectionTitle('账号信息'),
        CellGroup(
          children: [
            MenuCell(
              '用户名',
              'user',
              subtitle: '注册后不可修改',
              trailing: Text('@$username', style: context.text.bodySmall),
            ),
            MenuCell(
              '会员等级',
              'star',
              subtitle: '由管理员调整',
              trailing: Text('Lv.$level', style: context.text.bodySmall),
            ),
            MenuCell(
              '注册时间',
              'clock',
              trailing: Text(createdAt, style: context.text.bodySmall),
            ),
          ],
        ),
      ],
    );
  }
}
