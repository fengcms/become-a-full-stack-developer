import 'package:fullstack_reader/app/theme/app_theme.dart';
import 'package:fullstack_reader/shared/prototype_icons.dart';

import 'package:flutter/material.dart';

import 'package:fullstack_reader/shared/widgets/reader_context.dart';

/// 审核状态同时展示文字和图标，不能只依靠颜色区分。
class StatusBadge extends StatelessWidget {
  const StatusBadge(this.status, {super.key});
  final String status;
  @override
  Widget build(BuildContext context) {
    final pending = status == 'pending', draft = status == 'draft';
    final foreground = pending
        ? context.colors.statusPending
        : draft
        ? context.colors.statusDraft
        : context.colors.statusPublished;
    return Container(
      padding: AppInsets.statusBadge,
      decoration: BoxDecoration(
        color: pending
            ? context.colors.statusPendingBg
            : draft
            ? context.colors.statusDraftBg
            : context.colors.statusPublishedBg,
        borderRadius: AppRadius.rXs,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          ReaderIcon(
            pending
                ? Icons.schedule
                : draft
                ? Icons.edit_note
                : Icons.check_circle_outline,
            size: 14,
            color: foreground,
          ),
          const SizedBox(width: 4),
          Text(
            pending
                ? '待审核'
                : draft
                ? '草稿'
                : '已发布',
            style: context.text.labelSmall?.copyWith(color: foreground),
          ),
        ],
      ),
    );
  }
}
