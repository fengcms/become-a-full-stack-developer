import 'package:fullstack_reader/app/theme/app_theme.dart';
import 'package:fullstack_reader/shared/prototype_icons.dart';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:fullstack_reader/app/session.dart';
import 'package:fullstack_reader/core/generated/models.dart';
import 'package:fullstack_reader/shared/widgets/async_pane.dart';
import 'package:fullstack_reader/shared/widgets/page_frame.dart';
import 'package:fullstack_reader/shared/widgets/page_intro.dart';
import 'package:fullstack_reader/shared/widgets/reader_context.dart';
import 'package:fullstack_reader/shared/widgets/state_message.dart';

/// 标签筛选在本地执行，点击标签后进入带筛选条件的文章列表。
class TagsPage extends ConsumerStatefulWidget {
  const TagsPage({super.key});
  @override
  ConsumerState<TagsPage> createState() => _TagsPageState();
}

class _TagsPageState extends ConsumerState<TagsPage> {
  String filter = '';
  @override
  Widget build(BuildContext context) => PageFrame(
    title: '标签',
    child: Column(
      children: [
        const PageIntro('标签', '用标签横向串联不同模块的文章。'),
        Padding(
          padding: AppInsets.page,
          child: TextField(
            decoration: const InputDecoration(
              hintText: '筛选标签',
              prefixIcon: PrototypeIcon('search'),
            ),
            onChanged: (v) => setState(() => filter = v),
          ),
        ),
        Expanded(
          child: AsyncPane<List<ApiTag>>(
            load: ref.read(repositoryProvider).tags,
            builder: (tags, _) {
              final list = tags
                  .where(
                    (t) => (t.name ?? '').toLowerCase().contains(
                      filter.toLowerCase(),
                    ),
                  )
                  .toList();
              return list.isEmpty
                  ? const StateMessage(title: '没有匹配的标签')
                  : GridView.builder(
                      padding: AppInsets.page,
                      gridDelegate:
                          const SliverGridDelegateWithFixedCrossAxisCount(
                            crossAxisCount: 2,
                            mainAxisSpacing: 12,
                            crossAxisSpacing: 12,
                            mainAxisExtent: 100,
                          ),
                      itemCount: list.length,
                      itemBuilder: (c, i) {
                        final t = list[i];
                        return InkWell(
                          onTap: () => context.push(
                            '/browse?tag=${Uri.encodeComponent(t.name ?? '')}&title=${Uri.encodeComponent(t.name ?? '标签')}',
                          ),
                          child: Container(
                            padding: AppInsets.page,
                            decoration: BoxDecoration(
                              border: Border.all(color: context.colors.line),
                              borderRadius: AppRadius.rMd,
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Text(
                                  '# ${t.name}',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontSize: AppType.body,
                                    fontWeight: FontWeight.w500,
                                  ),
                                ),
                                const SizedBox(height: 5),
                                Text(
                                  '${t.articleCount ?? 0} 篇文章',
                                  style: context.text.labelSmall,
                                ),
                              ],
                            ),
                          ),
                        );
                      },
                    );
            },
          ),
        ),
      ],
    ),
  );
}
