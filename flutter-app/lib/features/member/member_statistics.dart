part of 'member_page.dart';

/// 统计项按字段名配对，调整显示顺序不会改变计数含义。
class _MemberStatistics extends StatelessWidget {
  const _MemberStatistics({required this.data});
  final Map<String, dynamic>? data;
  static const _items = [
    (key: 'favorites', label: '收藏'),
    (key: 'likes', label: '点赞'),
    (key: 'history', label: '足迹'),
    (key: 'articles', label: '稿件'),
  ];
  @override
  Widget build(BuildContext context) => Padding(
    padding: AppInsets.pageHorizontal,
    child: Row(
      children: [
        for (final item in _items)
          Expanded(
            child: Container(
              margin: EdgeInsets.only(
                right: item == _items.last ? 0 : AppSpacing.s3,
              ),
              padding: AppInsets.compact,
              decoration: BoxDecoration(
                border: Border.all(color: context.colors.line),
                borderRadius: AppRadius.rMd,
              ),
              child: Column(
                children: [
                  Text(
                    data == null ? '—' : '${data!['counts'][item.key]}',
                    style: const TextStyle(
                      fontFamily: 'monospace',
                      fontSize: AppType.statistic,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  Text(item.label, style: context.text.labelSmall),
                ],
              ),
            ),
          ),
      ],
    ),
  );
}
