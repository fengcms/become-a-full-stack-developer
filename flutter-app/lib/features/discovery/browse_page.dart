import 'package:flutter/material.dart';

import 'package:fullstack_reader/shared/widgets/article_feed.dart';
import 'package:fullstack_reader/shared/widgets/page_frame.dart';

/// 栏目和标签共享文章列表，查询参数参与缓存身份，避免不同筛选相互串页。
class BrowsePage extends StatelessWidget {
  const BrowsePage({super.key, required this.title, required this.query});
  final String title;
  final Map<String, dynamic> query;
  @override
  Widget build(BuildContext context) => PageFrame(
    title: title,
    child: ArticleFeed(key: ValueKey(query.toString()), query: query),
  );
}
