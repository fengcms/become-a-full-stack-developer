part of 'profile_page.dart';

/// 头像上传入口仅发送回调，显示值和上传锁由资料页统一管理。
class _AvatarCard extends StatelessWidget {
  const _AvatarCard({
    required this.avatar,
    required this.name,
    required this.username,
    required this.busy,
    required this.photo,
  });
  final String? avatar;
  final String name;
  final String username;
  final bool busy;
  final VoidCallback photo;
  @override
  Widget build(BuildContext context) {
    return Container(
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
                ? ClipOval(child: ReaderImage(avatar!, width: 56, height: 56))
                : Text(name.isEmpty ? '读' : name.characters.first),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  style: const TextStyle(
                    fontSize: AppType.body,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                Text('@$username', style: context.text.labelSmall),
              ],
            ),
          ),
          TextButton(onPressed: busy ? null : photo, child: const Text('更换头像')),
        ],
      ),
    );
  }
}
