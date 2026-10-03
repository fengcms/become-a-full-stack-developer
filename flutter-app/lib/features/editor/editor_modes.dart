part of '../editor.dart';

/// 编辑/预览切换保留同一组文本控制器，不丢失未保存内容。
class _EditorModes extends StatelessWidget {
  const _EditorModes({
    required this.preview,
    required this.length,
    required this.onMode,
  });
  final bool preview;
  final int length;
  final ValueChanged<bool> onMode;
  @override
  Widget build(BuildContext context) => Row(
    children: [
      for (final mode in [false, true])
        OutlinedButton(
          style: OutlinedButton.styleFrom(
            backgroundColor: preview == mode
                ? context.colors.brandSubtle
                : context.colors.surface,
            shape: RoundedRectangleBorder(borderRadius: AppRadius.rSm),
          ),
          onPressed: () => onMode(mode),
          child: Text(mode ? '预览' : '编辑'),
        ),
      const Spacer(),
      Text('$length / 65535', style: context.text.labelSmall),
    ],
  );
}
