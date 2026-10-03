part of '../editor.dart';

/// 保存和送审共享忙碌状态，避免重复写入。
class _EditorSaveBar extends StatelessWidget {
  const _EditorSaveBar({
    required this.status,
    required this.busy,
    required this.save,
  });
  final String status;
  final bool busy;
  final void Function(bool) save;
  @override
  Widget build(BuildContext context) => Container(
    padding: AppInsets.compact,
    decoration: BoxDecoration(
      color: context.colors.surface,
      border: Border(top: BorderSide(color: context.colors.line)),
    ),
    child: Row(
      children: [
        Expanded(
          child: OutlinedButton(
            onPressed: busy ? null : () => save(false),
            child: Text(status == 'draft' ? '保存草稿' : '保存修改'),
          ),
        ),
        if (status == 'draft') ...[
          const SizedBox(width: 12),
          Expanded(
            child: SubmitButton(
              label: '提交审核',
              busy: busy,
              onPressed: () => save(true),
            ),
          ),
        ],
        if (status != 'draft' && busy)
          const Padding(
            padding: AppInsets.small,
            child: CircularProgressIndicator(),
          ),
      ],
    ),
  );
}
