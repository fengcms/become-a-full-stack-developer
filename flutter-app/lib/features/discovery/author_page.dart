import 'package:fullstack_reader/core/network/endpoints.dart';
import 'package:fullstack_reader/app/theme/app_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:fullstack_reader/app/session.dart';
import 'package:fullstack_reader/shared/widgets/article_tile.dart';
import 'package:fullstack_reader/shared/widgets/async_pane.dart';
import 'package:fullstack_reader/shared/widgets/page_frame.dart';
import 'package:fullstack_reader/shared/widgets/reader_context.dart';
import 'package:fullstack_reader/shared/widgets/reader_image.dart';
import 'package:fullstack_reader/shared/widgets/section_title.dart';
import 'package:fullstack_reader/features/data/reader_models.dart';

/// 作者公开资料与文章列表共用页面，会员私有资料不从此入口读取。
class AuthorPage extends ConsumerWidget {
  const AuthorPage(this.id, {super.key});
  final String id;
  @override
  Widget build(BuildContext context, WidgetRef ref) => PageFrame(
    title: '作者主页',
    child: AsyncPane<dynamic>(
      load: () => ref.read(repositoryProvider).read(Endpoints.member(id)),
      builder: (data, reload) {
        final m = jsonMap(data);
        return ListView(
          children: [
            Container(
              margin: AppInsets.page,
              padding: AppInsets.featureCard,
              decoration: BoxDecoration(
                gradient: context.colors.heroWash,
                border: Border.all(color: context.colors.line),
                borderRadius: AppRadius.rMd,
              ),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 28,
                    backgroundColor: context.colors.brandSubtle,
                    foregroundColor: context.colors.brandOnSubtle,
                    child: m['avatar'] != null
                        ? ClipOval(
                            child: ReaderImage(
                              m['avatar'],
                              width: 56,
                              height: 56,
                            ),
                          )
                        : Text(
                            (m['nickname'] ?? '会员').toString().characters.first,
                          ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          m['nickname'] ?? '会员',
                          style: const TextStyle(
                            fontSize: AppType.h3,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        Text(
                          'Lv.${m['level'] ?? 1} · 已发布 ${m['articleCount'] ?? 0} 篇文章',
                          style: context.text.labelSmall,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SectionTitle('他的文章'),
            for (final a in (m['articles'] as List? ?? []))
              ArticleTile(Article.fromJson(jsonMap(a))),
          ],
        );
      },
    ),
  );
}
