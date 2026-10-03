import 'package:fullstack_reader/core/network/endpoints.dart';
import 'package:fullstack_reader/app/theme/app_theme.dart';

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:fullstack_reader/app/session.dart';
import 'package:fullstack_reader/shared/widgets/confirm.dart';
import 'package:fullstack_reader/shared/widgets/notice.dart';
import 'package:fullstack_reader/shared/widgets/reader_context.dart';
import 'package:fullstack_reader/shared/widgets/status_badge.dart';
import 'package:fullstack_reader/features/data/reader_models.dart';

part 'draft_actions.dart';

/// 根据稿件状态提供编辑、预览、送审和删除入口，并防止重复提交。
class DraftTile extends ConsumerStatefulWidget {
  const DraftTile(
    this.article, {
    super.key,
    required this.onEdit,
    required this.reload,
  });
  final Article article;
  final VoidCallback onEdit, reload;
  @override
  ConsumerState<DraftTile> createState() => _DraftTileState();
}

class _DraftTileState extends ConsumerState<DraftTile> {
  bool busy = false;
  Future<void> mutate(bool submit) async {
    if (busy) return;
    if (!await confirm(
      context,
      submit ? '提交审核' : '删除稿件',
      submit ? '提交后进入待审核状态，仍可继续编辑。' : '删除“${widget.article.title}”后不可恢复。',
    )) {
      return;
    }
    setState(() => busy = true);
    try {
      await ref
          .read(sessionProvider)
          .api
          .request(
            submit
                ? Endpoints.submit(widget.article.id)
                : Endpoints.article(widget.article.id),
            method: submit ? 'POST' : 'DELETE',
          );
      widget.reload();
    } catch (e) {
      if (mounted) notice(context, e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final a = widget.article;
    return Container(
      padding: AppInsets.page,
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: context.colors.line)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              StatusBadge(a.status),
              const SizedBox(width: 8),
              Text(
                '${a.data.updatedAt?.split('T').first ?? ''} 更新',
                style: context.text.labelSmall,
              ),
            ],
          ),
          const SizedBox(height: 8),
          InkWell(
            onTap: widget.onEdit,
            child: Text(
              a.title,
              style: TextStyle(
                fontSize: AppType.draftTitle,
                height: 1.5,
                fontWeight: FontWeight.w600,
                color: context.colors.textTitle,
              ),
            ),
          ),
          if (a.data.summary?.isNotEmpty == true)
            Padding(
              padding: AppInsets.replyTop,
              child: Text(
                a.data.summary!,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: AppType.listSummary,
                  height: 1.65,
                  color: context.colors.textMuted,
                ),
              ),
            ),
          if (a.status == 'pending')
            Padding(
              padding: AppInsets.progressTop,
              child: Text(
                '审核中，可以继续编辑',
                style: TextStyle(
                  fontSize: AppType.micro,
                  color: context.colors.warning,
                ),
              ),
            ),
          const SizedBox(height: 8),
          _DraftActions(
            a: a,
            busy: busy,
            onEdit: widget.onEdit,
            mutate: mutate,
          ),
          if (busy) const LinearProgressIndicator(),
        ],
      ),
    );
  }
}
