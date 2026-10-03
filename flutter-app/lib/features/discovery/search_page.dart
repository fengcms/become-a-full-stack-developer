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

part 'search_header.dart';
part 'search_suggestions.dart';
part 'search_results.dart';

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

  void clearHistory() {
    setState(() => history = []);
    ref.read(sessionProvider).preferences.remove('search.history');
  }

  @override
  Widget build(BuildContext context) => PageFrame(
    title: '搜索',
    child: Column(
      children: [
        _SearchHeader(input: input, search: search),
        _SearchResults(
          query: query,
          history: history,
          search: search,
          clearHistory: clearHistory,
        ),
      ],
    ),
  );
}
