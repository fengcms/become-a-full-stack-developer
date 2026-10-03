import 'package:fullstack_reader/app/theme/app_theme.dart';
import 'package:fullstack_reader/shared/prototype_icons.dart';

import 'package:flutter/material.dart';

import 'package:fullstack_reader/shared/widgets/reader_context.dart';

/// 统一设置入口的图标、说明与尾部操作，危险动作使用主题危险色。
class MenuCell extends StatelessWidget {
  const MenuCell(
    this.title,
    this.icon, {
    super.key,
    this.subtitle,
    this.onTap,
    this.trailing,
    this.danger = false,
  });
  final String title, icon;
  final String? subtitle;
  final VoidCallback? onTap;
  final Widget? trailing;
  final bool danger;
  @override
  Widget build(BuildContext context) => InkWell(
    onTap: onTap,
    child: Padding(
      padding: AppInsets.toolbar,
      child: Row(
        children: [
          PrototypeIcon(
            icon,
            size: 20,
            color: danger ? context.colors.danger : context.colors.brand,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontSize: AppType.menuTitle,
                    color: danger
                        ? context.colors.danger
                        : context.colors.textBody,
                  ),
                ),
                if (subtitle != null)
                  Text(
                    subtitle!,
                    style: TextStyle(
                      fontSize: AppType.metadata,
                      height: 1.6,
                      color: context.colors.textMuted,
                    ),
                  ),
              ],
            ),
          ),
          trailing ??
              PrototypeIcon('chevr', size: 15, color: context.colors.textMuted),
        ],
      ),
    ),
  );
}
