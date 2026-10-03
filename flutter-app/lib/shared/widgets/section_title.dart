import 'package:fullstack_reader/app/theme/app_theme.dart';
import 'package:fullstack_reader/shared/prototype_icons.dart';

import 'package:flutter/material.dart';

import 'package:fullstack_reader/shared/widgets/reader_context.dart';

/// 区块标题和可选操作共享固定分隔线与留白。
class SectionTitle extends StatelessWidget {
  const SectionTitle(this.title, {super.key, this.action, this.onTap});
  final String title;
  final String? action;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) => Container(
    margin: AppInsets.sectionTitle,
    padding: AppInsets.groupBottom,
    decoration: BoxDecoration(
      border: Border(bottom: BorderSide(color: context.colors.line)),
    ),
    child: Row(
      children: [
        Expanded(
          child: Text(
            title,
            style: TextStyle(
              fontSize: AppType.h3,
              fontWeight: FontWeight.w600,
              color: context.colors.textTitle,
            ),
          ),
        ),
        if (action != null)
          InkWell(
            onTap: onTap,
            child: Padding(
              padding: AppInsets.link,
              child: Row(
                children: [
                  Text(
                    action!,
                    style: TextStyle(
                      fontSize: AppType.smallLabel,
                      color: context.colors.brand,
                    ),
                  ),
                  PrototypeIcon('chevr', size: 14, color: context.colors.brand),
                ],
              ),
            ),
          ),
      ],
    ),
  );
}
