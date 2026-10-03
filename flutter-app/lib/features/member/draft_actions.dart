part of 'draft_tile.dart';

/// 稿件操作按状态展示，按钮共享提交锁。
class _DraftActions extends StatelessWidget {
  const _DraftActions({
    required this.a,
    required this.busy,
    required this.onEdit,
    required this.mutate,
  });
  final Article a;
  final bool busy;
  final VoidCallback onEdit;
  final void Function(bool) mutate;
  @override
  Widget build(BuildContext context) => Wrap(
    spacing: 8,
    runSpacing: 8,
    children: [
      OutlinedButton(
        onPressed: busy ? null : onEdit,
        child: Text(a.status == 'published' ? '修改' : '编辑'),
      ),
      OutlinedButton(
        onPressed: () => context.push(
          a.status == 'published'
              ? '/articles/${a.route}'
              : '/member/articles/${a.id}/preview',
        ),
        child: Text(a.status == 'published' ? '查看' : '预览'),
      ),
      if (a.status == 'draft')
        FilledButton(
          onPressed: busy ? null : () => mutate(true),
          child: const Text('提交审核'),
        ),
      if (a.status != 'published')
        TextButton(
          onPressed: busy ? null : () => mutate(false),
          child: Text('删除', style: TextStyle(color: context.colors.danger)),
        ),
    ],
  );
}
