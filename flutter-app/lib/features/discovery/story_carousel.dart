part of 'focus_stories.dart';

/// 轮播控制器由宿主持有，页码变化通过回调传回。
class _StoryCarousel extends StatelessWidget {
  const _StoryCarousel({
    required this.items,
    required this.controller,
    required this.onChanged,
  });
  final List<Article> items;
  final PageController controller;
  final ValueChanged<int> onChanged;
  @override
  Widget build(BuildContext context) => SizedBox(
    height: 190 + (MediaQuery.textScalerOf(context).scale(1) - 1) * 160,
    child: PageView.builder(
      controller: controller,
      itemCount: items.length,
      onPageChanged: onChanged,
      itemBuilder: (c, i) {
        final a = items[i];
        return _StoryCard(a: a);
      },
    ),
  );
}
