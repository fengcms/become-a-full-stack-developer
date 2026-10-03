import '../shared/prototype_icons.dart';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../app/session.dart';
import '../core/generated/models.dart';
import '../shared/widgets.dart';
import 'repository.dart';

class HomePage extends ConsumerWidget {
  const HomePage({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) => PageFrame(
    title: '成为全栈',
    titleWidget: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
          decoration: BoxDecoration(
            color: context.colors.brandSubtle,
            borderRadius: BorderRadius.circular(4),
          ),
          child: Text(
            '{ }',
            style: TextStyle(
              fontFamily: 'monospace',
              fontSize: 15,
              fontWeight: FontWeight.w700,
              color: context.colors.brandOnSubtle,
            ),
          ),
        ),
        const SizedBox(width: 8),
        Text(
          '成为全栈',
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w700,
            color: context.colors.textTitle,
          ),
        ),
      ],
    ),
    actions: [
      IconButton(
        tooltip: '搜索',
        onPressed: () => context.go('/search'),
        icon: const PrototypeIcon('search'),
      ),
      IconButton(
        tooltip: '通知',
        onPressed: () => context.push('/member/notifications'),
        icon: const UnreadIcon(Icons.notifications_none),
      ),
    ],
    child: ArticleFeed(
      query: const {'pageSize': 4},
      header: Column(
        children: [
          AsyncPane<PageResult<Article>>(
            load: () => ref
                .read(repositoryProvider)
                .articles(query: {'sort': '-publishedAt', 'pageSize': 3}),
            builder: (p, _) =>
                p.items.isEmpty ? const SizedBox() : FocusStories(p.items),
          ),
          SectionTitle(
            '最新文章',
            action: '全部',
            onTap: () => context.go('/categories'),
          ),
        ],
      ),
      interlude: Column(
        children: [
          SectionTitle(
            '热门阅读',
            action: '更多',
            onTap: () => context.push('/tags'),
          ),
          AsyncPane<PageResult<Article>>(
            load: () => ref
                .read(repositoryProvider)
                .articles(query: {'sort': '-viewCount', 'pageSize': 5}),
            builder: (p, _) => Column(
              children: [
                for (var i = 0; i < p.items.length; i++)
                  InkWell(
                    onTap: () => context.push('/articles/${p.items[i].route}'),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 12,
                      ),
                      decoration: BoxDecoration(
                        border: Border(
                          bottom: BorderSide(color: context.colors.line),
                        ),
                      ),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '${i + 1}'.padLeft(2, '0'),
                            style: TextStyle(
                              fontFamily: 'monospace',
                              fontSize: 14,
                              fontWeight: FontWeight.w700,
                              color: context.colors.brand,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              p.items[i].title,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                fontSize: 14,
                                height: 1.55,
                                color: context.colors.textBody,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            '${p.items[i].data.viewCount ?? 0}',
                            style: context.text.labelSmall,
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 24),
        ],
      ),
    ),
  );
}

class FocusStories extends StatefulWidget {
  const FocusStories(this.items, {super.key});
  final List<Article> items;
  @override
  State<FocusStories> createState() => _FocusStoriesState();
}

class _FocusStoriesState extends State<FocusStories> {
  int current = 0;
  final controller = PageController();
  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  void step(int by) => controller.animateToPage(
    (current + by + widget.items.length) % widget.items.length,
    duration: const Duration(milliseconds: 200),
    curve: Curves.easeOut,
  );
  @override
  Widget build(BuildContext context) => Column(
    children: [
      SizedBox(
        height: 190 + (MediaQuery.textScalerOf(context).scale(1) - 1) * 160,
        child: PageView.builder(
          controller: controller,
          itemCount: widget.items.length,
          onPageChanged: (i) => setState(() => current = i),
          itemBuilder: (c, i) {
            final a = widget.items[i];
            return Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
              child: Material(
                color: Colors.transparent,
                child: InkWell(
                  onTap: () => context.push('/articles/${a.route}'),
                  borderRadius: BorderRadius.circular(8),
                  child: Ink(
                    decoration: BoxDecoration(
                      gradient: context.colors.heroWash,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Stack(
                      children: [
                        Positioned(
                          right: 14,
                          top: -6,
                          child: Text(
                            '{ API }',
                            style: TextStyle(
                              fontFamily: 'monospace',
                              fontSize: 46,
                              fontWeight: FontWeight.w600,
                              color: context.colors.textTitle.withValues(
                                alpha: .08,
                              ),
                            ),
                          ),
                        ),
                        Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                '焦点阅读',
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w600,
                                  color: context.colors.brandOnSubtle,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                a.title,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  fontSize: 22,
                                  height: 1.32,
                                  fontWeight: FontWeight.w700,
                                  color: context.colors.textTitle,
                                ),
                              ),
                              const SizedBox(height: 8),
                              Text(
                                a.data.summary ?? '',
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  fontSize: 13,
                                  height: 1.62,
                                  color: context.colors.textMuted,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            );
          },
        ),
      ),
      Padding(
        padding: const EdgeInsets.fromLTRB(10, 2, 10, 0),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            _control('上一条焦点', 'back', () => step(-1)),
            Row(
              children: [
                for (var i = 0; i < widget.items.length; i++)
                  Container(
                    margin: const EdgeInsets.only(right: 6),
                    width: 20,
                    height: 4,
                    decoration: BoxDecoration(
                      color: context.colors.brand.withValues(
                        alpha: i == current ? 1 : .28,
                      ),
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                const SizedBox(width: 6),
                Text(
                  '${current + 1} / ${widget.items.length}',
                  style: context.text.labelSmall,
                ),
              ],
            ),
            _control('下一条焦点', 'chevr', () => step(1)),
          ],
        ),
      ),
    ],
  );
  Widget _control(String label, String icon, VoidCallback tap) => IconButton(
    tooltip: label,
    onPressed: tap,
    icon: Container(
      width: 32,
      height: 32,
      decoration: BoxDecoration(
        border: Border.all(color: context.colors.lineStrong),
        shape: BoxShape.circle,
      ),
      child: Center(
        child: PrototypeIcon(icon, size: 15, color: context.colors.textMuted),
      ),
    ),
  );
}

class CategoriesPage extends ConsumerWidget {
  const CategoriesPage({super.key});
  Widget node(BuildContext context, ApiCategoryNode n, Map<int, int> counts) =>
      n.children.isEmpty
      ? ListTile(
          leading: const SizedBox(width: 15),
          minLeadingWidth: 15,
          horizontalTitleGap: 8,
          contentPadding: const EdgeInsets.symmetric(horizontal: 16),
          title: Text(n.name ?? ''),
          trailing: Text(
            '${counts[n.id] ?? 0} 篇',
            style: context.text.labelSmall,
          ),
          onTap: () => context.push(
            '/browse?category=${n.slug}&title=${Uri.encodeComponent(n.name ?? '分类文章')}',
          ),
        )
      : ExpansionTile(
          leading: const PrototypeIcon('chevr', size: 15),
          title: Text(n.name ?? ''),
          children: [
            ListTile(
              title: Text('全部${n.name}文章'),
              onTap: () => context.push(
                '/browse?category=${n.slug}&title=${Uri.encodeComponent(n.name ?? '分类文章')}',
              ),
            ),
            for (final child in n.children)
              Padding(
                padding: const EdgeInsets.only(left: 16),
                child: node(context, child, counts),
              ),
          ],
        );
  @override
  Widget build(BuildContext context, WidgetRef ref) => PageFrame(
    title: '分类',
    actions: [
      TextButton(
        onPressed: () => context.push('/tags'),
        child: const PrototypeIcon('tag'),
      ),
    ],
    child: AsyncPane<(List<ApiCategoryNode>, Map<int, int>)>(
      load: () async {
        final categories = await ref.read(repositoryProvider).categories();
        final stats =
            await ref.read(repositoryProvider).read('/categories/stats')
                as List;
        return (
          categories,
          {for (final c in stats) c['id'] as int: c['articleCount'] as int},
        );
      },
      builder: (data, reload) => RefreshIndicator(
        onRefresh: reload,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            const PageIntro('分类', '按学习路径划分，父分类包含全部后代分类的文章。'),
            if (data.$1.isEmpty) const StateMessage(title: '暂无分类'),
            for (final n in data.$1)
              Container(
                decoration: BoxDecoration(
                  border: Border(
                    bottom: BorderSide(color: context.colors.line),
                  ),
                ),
                child: node(context, n, data.$2),
              ),
          ],
        ),
      ),
    ),
  );
}

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
          padding: const EdgeInsets.all(16),
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
                      padding: const EdgeInsets.all(16),
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
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              border: Border.all(color: context.colors.line),
                              borderRadius: BorderRadius.circular(8),
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
                                    fontSize: 15,
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
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: input,
                  textInputAction: TextInputAction.search,
                  onSubmitted: (_) => search(),
                  style: const TextStyle(fontSize: 15),
                  decoration: InputDecoration(
                    hintText: '搜索文章、标签',
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 8,
                    ),
                    prefixIconConstraints: const BoxConstraints(
                      minWidth: 40,
                      minHeight: 40,
                    ),
                    isDense: true,
                    prefixIcon: const Padding(
                      padding: EdgeInsets.all(12),
                      child: PrototypeIcon('search', size: 16),
                    ),
                    filled: true,
                    fillColor: context.colors.bgSubtle,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(99),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(99),
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
                      padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                              '搜索历史',
                              style: TextStyle(
                                fontSize: 13,
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
                      padding: const EdgeInsets.all(16),
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
                        padding: const EdgeInsets.all(16),
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
                  path: '/search',
                  header: const SectionTitle('搜索结果'),
                  query: {'q': query, 'type': 'article'},
                ),
        ),
      ],
    ),
  );
}

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

class AuthorPage extends ConsumerWidget {
  const AuthorPage(this.id, {super.key});
  final String id;
  @override
  Widget build(BuildContext context, WidgetRef ref) => PageFrame(
    title: '作者主页',
    child: AsyncPane<dynamic>(
      load: () => ref.read(repositoryProvider).read('/members/$id'),
      builder: (data, reload) {
        final m = jsonMap(data);
        return ListView(
          children: [
            Container(
              margin: const EdgeInsets.all(16),
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                gradient: context.colors.heroWash,
                border: Border.all(color: context.colors.line),
                borderRadius: BorderRadius.circular(8),
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
                            fontSize: 17,
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
