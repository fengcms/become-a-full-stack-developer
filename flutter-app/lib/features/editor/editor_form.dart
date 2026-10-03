part of '../editor.dart';

/// 正文表单接收控制器，保存与草稿持久化仍由页面负责。
class _EditorForm extends StatelessWidget {
  const _EditorForm({
    required this.status,
    required this.dirty,
    required this.id,
    required this.title,
    required this.summary,
    required this.content,
    required this.toolbar,
  });
  final String status;
  final bool dirty;
  final int? id;
  final TextEditingController title;
  final TextEditingController summary;
  final TextEditingController content;
  final Widget toolbar;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Row(
        children: [
          StatusBadge(status),
          const SizedBox(width: 12),
          Text(
            dirty
                ? '有未保存的修改'
                : id == null
                ? '尚未保存'
                : '已与服务器同步',
            style: context.text.bodySmall,
          ),
        ],
      ),
      const SizedBox(height: 16),
      const Text(
        '标题 *',
        style: TextStyle(
          fontSize: AppType.caption,
          fontWeight: FontWeight.w500,
        ),
      ),
      const SizedBox(height: 7),
      TextField(
        key: const ValueKey('editor-title'),
        controller: title,
        maxLength: 200,
        decoration: const InputDecoration(hintText: '不超过 200 字'),
      ),
      const Text(
        '摘要',
        style: TextStyle(
          fontSize: AppType.caption,
          fontWeight: FontWeight.w500,
        ),
      ),
      const SizedBox(height: 7),
      TextField(
        controller: summary,
        maxLength: 500,
        minLines: 2,
        maxLines: 4,
        decoration: const InputDecoration(hintText: '一到两句话说清这篇文章解决什么问题'),
      ),
      const Text(
        '正文（Markdown）',
        style: TextStyle(
          fontSize: AppType.caption,
          fontWeight: FontWeight.w500,
        ),
      ),
      const SizedBox(height: 7),
      TextField(
        key: const ValueKey('editor-content'),
        controller: content,
        minLines: 14,
        maxLines: null,
        maxLength: 65535,
        maxLengthEnforcement: MaxLengthEnforcement.enforced,
        style: const TextStyle(
          fontFamily: 'monospace',
          fontSize: AppType.caption,
          height: 1.85,
        ),
        decoration: const InputDecoration(
          hintText: '开始写作…',
          alignLabelWithHint: true,
        ),
      ),
      toolbar,
    ],
  );
}
