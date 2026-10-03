import 'package:fullstack_reader/app/theme/app_theme.dart';
import 'package:flutter/material.dart';

import 'package:fullstack_reader/shared/widgets/reader_context.dart';

/// 页面引导文案按统一标题和说明层级展示。
class PageIntro extends StatelessWidget {
  const PageIntro(this.title, this.subtitle, {super.key});
  final String title, subtitle;
  @override
  Widget build(BuildContext context) => Padding(
    padding: AppInsets.intro,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: TextStyle(
            fontSize: AppType.h1,
            height: 1.35,
            fontWeight: FontWeight.w700,
            color: context.colors.textTitle,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          subtitle,
          style: TextStyle(
            fontSize: AppType.listSummary,
            height: 1.65,
            color: context.colors.textMuted,
          ),
        ),
      ],
    ),
  );
}
