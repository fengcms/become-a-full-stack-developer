import 'package:fullstack_reader/core/network/endpoints.dart';
import 'package:fullstack_reader/shared/prototype_icons.dart';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:fullstack_reader/app/session.dart';
import 'package:fullstack_reader/shared/widgets/article_feed.dart';
import 'package:fullstack_reader/shared/widgets/confirm.dart';
import 'package:fullstack_reader/shared/widgets/notice.dart';
import 'package:fullstack_reader/shared/widgets/page_frame.dart';

/// 收藏、点赞和历史复用列表布局，移除操作按各自端点执行。
class MemberListPage extends ConsumerStatefulWidget {
  const MemberListPage(this.kind, {super.key});
  final String kind;
  @override
  ConsumerState<MemberListPage> createState() => _MemberListPageState();
}

class _MemberListPageState extends ConsumerState<MemberListPage> {
  String get kind => widget.kind;
  int revision = 0;
  @override
  Widget build(BuildContext context) {
    final label =
        {'favorites': '我的收藏', 'likes': '我的点赞', 'history': '阅读历史'}[kind] ??
        '我的内容';
    return PageFrame(
      title: label,
      actions: [
        if (kind == 'history')
          TextButton(
            onPressed: () async {
              if (!await confirm(context, '清空阅读历史', '将移除当前账号全部阅读记录。')) return;
              try {
                await ref
                    .read(sessionProvider)
                    .api
                    .request(Endpoints.meHistory, method: 'DELETE');
                if (mounted) setState(() => revision++);
              } catch (e) {
                if (context.mounted) notice(context, e);
              }
            },
            child: const Text('清空'),
          ),
      ],
      child: ArticleFeed(
        key: ValueKey('$kind-$revision-${ref.watch(sessionProvider).epoch}'),
        path: Endpoints.collection(kind),
        trailing: (a, reload) => IconButton(
          tooltip: kind == 'likes' ? '取消点赞' : '移除记录',
          icon: const ReaderIcon(Icons.close, size: 18),
          onPressed: () async {
            if (!await confirm(
              context,
              kind == 'history'
                  ? '移除阅读记录'
                  : '取消${kind == 'likes' ? '点赞' : '收藏'}',
              a.title,
            )) {
              return;
            }
            try {
              await ref
                  .read(sessionProvider)
                  .api
                  .request(
                    kind == 'likes'
                        ? Endpoints.like(a.id)
                        : Endpoints.collectionItem(kind, a.id),
                    method: 'DELETE',
                  );
              reload();
            } catch (e) {
              if (context.mounted) notice(context, e);
            }
          },
        ),
      ),
    );
  }
}
