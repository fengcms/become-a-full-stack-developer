part of 'member_page.dart';

/// 会员身份卡与统计加载独立，头像保持账号缓存隔离。
class _MemberHeader extends StatelessWidget {
  const _MemberHeader({required this.user});
  final ApiUser? user;
  @override
  Widget build(BuildContext context) => Container(
    margin: AppInsets.page,
    padding: AppInsets.featureCard,
    decoration: BoxDecoration(
      gradient: context.colors.heroWash,
      border: Border.all(color: context.colors.line),
      borderRadius: AppRadius.rMd,
    ),
    child: Row(
      children: [
        CircleAvatar(
          radius: 28,
          backgroundColor: context.colors.brandSubtle,
          foregroundColor: context.colors.brandOnSubtle,
          child: user?.avatar?.isNotEmpty == true
              ? ClipOval(
                  child: ReaderImage(user!.avatar!, width: 56, height: 56),
                )
              : Text(
                  (user?.nickname?.isNotEmpty == true ? user!.nickname! : '读者')
                      .characters
                      .first,
                  style: const TextStyle(fontSize: AppType.avatarLetter),
                ),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                user?.nickname ?? '欢迎来到成为全栈',
                style: TextStyle(
                  fontSize: AppType.h3,
                  fontWeight: FontWeight.w600,
                  color: context.colors.textTitle,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                user == null
                    ? '登录后可以收藏、评论和投稿'
                    : 'Lv.${user!.level ?? 1} · 会员 · @${user!.username}',
                style: const TextStyle(fontSize: AppType.metadata),
              ),
            ],
          ),
        ),
        if (user != null)
          IconButton(
            onPressed: () => context.push('/member/profile'),
            icon: const PrototypeIcon('chevr'),
          ),
      ],
    ),
  );
}
