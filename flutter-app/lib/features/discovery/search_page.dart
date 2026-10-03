import 'package:fullstack_reader/core/network/endpoints.dart';
import 'package:fullstack_reader/app/theme/app_theme.dart';
import 'package:fullstack_reader/shared/prototype_icons.dart';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:fullstack_reader/app/session.dart';
import 'package:fullstack_reader/core/generated/models.dart';
import 'package:fullstack_reader/shared/widgets/article_feed.dart';
import 'package:fullstack_reader/shared/widgets/async_pane.dart';
import 'package:fullstack_reader/shared/widgets/page_frame.dart';
import 'package:fullstack_reader/shared/widgets/reader_context.dart';
import 'package:fullstack_reader/shared/widgets/section_title.dart';

/// 搜索词进入路由以支持返回恢复，历史记录保存在设备偏好设置中。
class SearchPage extends ConsumerStatefulWidget {
  const SearchPage({super.key, this.initial = ''});
  final String initial;
  @override
  ConsumerState<SearchPage> createState() => _SearchPageState();
}

class _SearchPageState extends ConsumerState<SearchPage> {
  late final TextEditingController input;
  String query = '';
  List<String> history = [];
  @override
  void initState() {
    super.initState();
    input = TextEditingController(text: widget.initial);
    query = widget.initial;
    history =
        ref.read(sessionProvider).preferences.getStringList('search.history') ??
        [];
  }

  @override
  void didUpdateWidget(covariant SearchPage old) {
    super.didUpdateWidget(old);
    if (old.initial != widget.initial) {
      query = widget.initial;
      input.text = query;
    }
  }

  @override
  void dispose() {
    input.dispose();
    super.dispose();
  }

  void search([String? term]) {
    FocusScope.of(context).unfocus();
    final q = (term ?? input.text).trim();
    if (q.isNotEmpty) {
      history = [q, ...history.where((s) => s != q)].take(10).toList();
      ref
          .read(sessionProvider)
          .preferences
          .setStringList('search.history', history);
    }
    setState(() {
      query = q;
      input.text = q;
    });
    context.go(q.isEmpty ? '/search' : '/search?q=${Uri.encodeComponent(q)}');
  }

  @override
  Widget build(BuildContext context) => PageFrame(
    title: '搜索',
    child: Column(
      children: [
        Padding(
          padding: AppInsets.page,
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: input,
                  textInputAction: TextInputAction.search,
                  onSubmitted: (_) => search(),
                  style: const TextStyle(fontSize: AppType.body),
                  decoration: InputDecoration(
                    hintText: '搜索文章、标签',
                    contentPadding: AppInsets.control,
                    prefixIconConstraints: const BoxConstraints(
                      minWidth: 40,
                      minHeight: 40,
                    ),
                    isDense: true,
                    prefixIcon: const Padding(
                      padding: AppInsets.compact,
                      child: PrototypeIcon('search', size: 16),
                    ),
                    filled: true,
                    fillColor: context.colors.bgSubtle,
                    border: OutlineInputBorder(borderRadius: AppRadius.rFull),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: AppRadius.rFull,
                      borderSide: BorderSide(color: context.colors.fieldBorder),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              FilledButton(onPressed: search, child: const Text('搜索')),
            ],
          ),
        ),
        Expanded(
          child: query.isEmpty
              ? ListView(
                  children: [
                    Padding(
                      padding: AppInsets.pageTop,
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                              '搜索历史',
                              style: TextStyle(
                                fontSize: AppType.caption,
                                fontWeight: FontWeight.w600,
                                color: context.colors.textMuted,
                              ),
                            ),
                          ),
                          if (history.isNotEmpty)
                            TextButton(
                              onPressed: () {
                                setState(() => history = []);
                                ref
                                    .read(sessionProvider)
                                    .preferences
                                    .remove('search.history');
                              },
                              child: const Text('清空'),
                            ),
                        ],
                      ),
                    ),
                    Padding(
                      padding: AppInsets.page,
                      child: Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          for (final term in history)
                            ActionChip(
                              label: Text(term),
                              onPressed: () => search(term),
                            ),
                        ],
                      ),
                    ),
                    SectionTitle(
                      '热门标签',
                      action: '全部',
                      onTap: () => context.push('/tags'),
                    ),
                    AsyncPane<List<ApiTag>>(
                      load: ref.read(repositoryProvider).tags,
                      builder: (tags, reload) => Padding(
                        padding: AppInsets.page,
                        child: Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            for (final t in tags.take(8))
                              ActionChip(
                                label: Text(t.name ?? ''),
                                onPressed: () => search(t.name),
                              ),
                          ],
                        ),
                      ),
                    ),
                  ],
                )
              : ArticleFeed(
                  key: ValueKey(query),
                  path: Endpoints.search,
                  header: const SectionTitle('搜索结果'),
                  query: {'q': query, 'type': 'article'},
                ),
        ),
      ],
    ),
  );
}
