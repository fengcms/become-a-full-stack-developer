part of '../editor.dart';

/// 投稿预览中的正文和图片不得进入公开缓存。
class _EditorPreview extends StatelessWidget {
  const _EditorPreview({
    required this.title,
    required this.summary,
    required this.content,
    required this.nickname,
  });
  final String title;
  final String summary;
  final String content;
  final String nickname;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Text(title, style: context.text.headlineSmall),
      const SizedBox(height: 16),
      Row(
        children: [
          CircleAvatar(
            radius: 16,
            backgroundColor: context.colors.brandSubtle,
            foregroundColor: context.colors.brandOnSubtle,
            child: const PrototypeIcon('user', size: 18),
          ),
          const SizedBox(width: 12),
          Text('$nickname · 预览 · 尚未发布', style: context.text.bodySmall),
        ],
      ),
      if (summary.isNotEmpty)
        Container(
          margin: AppInsets.sectionVertical,
          padding: AppInsets.page,
          color: context.colors.surfaceSunken,
          child: Text(summary, style: context.text.bodySmall),
        ),
      ReaderMarkdown(content, publicImages: false),
    ],
  );
}
