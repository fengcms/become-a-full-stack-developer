import 'package:fullstack_reader/app/theme/app_theme.dart';
import 'package:flutter/material.dart';

import 'package:fullstack_reader/shared/widgets/reader_context.dart';

/// 同组设置项共用卡片边框和圆角，减少页面重复装饰。
class CellGroup extends StatelessWidget {
  const CellGroup({super.key, required this.children});
  final List<Widget> children;
  @override
  Widget build(BuildContext context) => Container(
    margin: AppInsets.sectionHeader,
    clipBehavior: Clip.antiAlias,
    decoration: BoxDecoration(
      color: context.colors.surface,
      border: Border.all(color: context.colors.line),
      borderRadius: AppRadius.rMd,
    ),
    child: Column(
      children: [
        for (var i = 0; i < children.length; i++) ...[
          if (i > 0) const Divider(),
          children[i],
        ],
      ],
    ),
  );
}
