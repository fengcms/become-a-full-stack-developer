part of '../editor.dart';

/// 发布信息使用父级控制器，关闭面板后分类、标签与封面仍保留在草稿里。
class _EditorMetadata extends StatelessWidget {
  const _EditorMetadata({
    required this.category,
    required this.categories,
    required this.tags,
    required this.getCover,
    required this.onCategory,
    required this.removeCover,
    required this.pickCover,
  });
  final int? category;
  final List<ApiCategoryNode> categories;
  final TextEditingController tags;
  final String Function() getCover;
  final ValueChanged<int?> onCategory;
  final VoidCallback removeCover;
  final Future<void> Function() pickCover;
  @override
  Widget build(BuildContext context) => StatefulBuilder(
    builder: (c, refresh) {
      final cover = getCover();
      return SafeArea(
        child: SingleChildScrollView(
          padding: EdgeInsets.fromLTRB(
            AppSpacing.page,
            0,
            AppSpacing.page,
            AppSpacing.page + MediaQuery.viewInsetsOf(c).bottom,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('发布信息', style: c.text.titleMedium),
              const SizedBox(height: 16),
              DropdownButtonFormField<int>(
                initialValue: category,
                decoration: const InputDecoration(labelText: '分类'),
                items: [
                  const DropdownMenuItem<int>(value: null, child: Text('未分类')),
                  for (final n in categories)
                    DropdownMenuItem(value: n.id, child: Text(n.name ?? '')),
                ],
                onChanged: (v) {
                  onCategory(v);
                },
              ),
              const SizedBox(height: 16),
              TextField(
                controller: tags,
                decoration: const InputDecoration(
                  labelText: '标签',
                  hintText: '用逗号分隔',
                ),
              ),
              const SizedBox(height: 12),
              if (cover.isNotEmpty)
                Stack(
                  children: [
                    ReaderImage(cover, height: 140, width: double.infinity),
                    Positioned(
                      right: 0,
                      top: 0,
                      child: IconButton(
                        tooltip: '移除封面',
                        onPressed: () {
                          removeCover();
                          refresh(() {});
                        },
                        icon: const ReaderIcon(Icons.close),
                      ),
                    ),
                  ],
                ),
              OutlinedButton.icon(
                onPressed: () async {
                  await pickCover();
                  refresh(() {});
                },
                icon: const ReaderIcon(Icons.image_outlined),
                label: Text(cover.isEmpty ? '上传封面' : '更换封面'),
              ),
              const SizedBox(height: 12),
            ],
          ),
        ),
      );
    },
  );
}
