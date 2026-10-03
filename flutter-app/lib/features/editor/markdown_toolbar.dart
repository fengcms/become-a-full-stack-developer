part of '../editor.dart';

/// 工具栏只插入 Markdown 字符，上传进度由编辑器统一管理。
class _MarkdownToolbar extends StatelessWidget {
  const _MarkdownToolbar({required this.insert, required this.pickImage});
  final void Function(String, String) insert;
  final VoidCallback pickImage;
  @override
  Widget build(BuildContext context) => Wrap(
    spacing: 4,
    runSpacing: 4,
    children: [
      IconButton(
        tooltip: '表格',
        onPressed: () => insert('\n| 标题 | 内容 |\n| --- | --- |\n| ', ' |  |\n'),
        icon: const Text('▦'),
      ),
      IconButton(
        tooltip: '列表',
        onPressed: () => insert('\n- ', ''),
        icon: const Text('≣'),
      ),
      IconButton(
        tooltip: '标题格式',
        onPressed: () => insert('\n## ', ''),
        icon: const Text(
          'H2',
          style: TextStyle(fontFamily: 'monospace', fontSize: AppType.label),
        ),
      ),
      IconButton(
        tooltip: '加粗',
        onPressed: () => insert('**', '**'),
        icon: const Text(
          'B',
          style: TextStyle(fontFamily: 'monospace', fontSize: AppType.label),
        ),
      ),
      IconButton(
        tooltip: '代码块',
        onPressed: () => insert('\n```\n', '\n```\n'),
        icon: const Text(
          '</>',
          style: TextStyle(fontFamily: 'monospace', fontSize: AppType.label),
        ),
      ),
      IconButton(
        tooltip: '引用',
        onPressed: () => insert('\n> ', ''),
        icon: const Text(
          '❞',
          style: TextStyle(fontFamily: 'monospace', fontSize: AppType.label),
        ),
      ),
      IconButton(
        tooltip: '链接',
        onPressed: () => insert('[', '](https://)'),
        icon: const Text(
          '↗',
          style: TextStyle(fontFamily: 'monospace', fontSize: AppType.label),
        ),
      ),
      IconButton(
        tooltip: '插入图片',
        onPressed: pickImage,
        icon: const ReaderIcon(Icons.add_photo_alternate_outlined),
      ),
    ],
  );
}
