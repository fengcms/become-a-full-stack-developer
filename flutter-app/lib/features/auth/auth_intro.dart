part of '../auth_page.dart';

/// 登录和注册只切换引导文案，品牌标识与留白保持原型一致。
class _AuthIntro extends StatelessWidget {
  const _AuthIntro({required this.register});
  final bool register;
  @override
  Widget build(BuildContext context) {
    return Column(
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
          register ? '注册' : '登录',
          style: TextStyle(
            fontSize: AppType.h1,
            fontWeight: FontWeight.w700,
            color: context.colors.textTitle,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          register ? '注册后默认为普通会员，可以投稿。' : '登录后可以收藏、评论和投稿。',
          style: TextStyle(
            fontSize: AppType.listSummary,
            height: 1.65,
            color: context.colors.textMuted,
          ),
        ),
        const SizedBox(height: 20),
      ],
    );
  }
}
