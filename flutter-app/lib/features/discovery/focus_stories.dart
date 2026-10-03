import 'package:fullstack_reader/app/theme/app_theme.dart';
import 'package:fullstack_reader/shared/prototype_icons.dart';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'package:fullstack_reader/shared/widgets/reader_context.dart';
import 'package:fullstack_reader/features/data/reader_models.dart';

part 'story_card.dart';
part 'story_carousel.dart';
part 'page_dots.dart';

/// 焦点图使用原型图标和渐变；切换索引仅影响当前轮播组件。
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
      _StoryCarousel(
        items: widget.items,
        controller: controller,
        onChanged: (i) => setState(() => current = i),
      ),
      Padding(
        padding: AppInsets.tagLabel,
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            _control('上一条焦点', 'back', () => step(-1)),
            _PageDots(count: widget.items.length, current: current),
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
