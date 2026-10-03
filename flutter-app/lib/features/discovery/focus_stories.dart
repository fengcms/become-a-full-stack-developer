import 'package:fullstack_reader/app/theme/app_theme.dart';
import 'package:fullstack_reader/shared/prototype_icons.dart';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'package:fullstack_reader/shared/widgets/reader_context.dart';
import 'package:fullstack_reader/features/data/reader_models.dart';

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
      SizedBox(
        height: 190 + (MediaQuery.textScalerOf(context).scale(1) - 1) * 160,
        child: PageView.builder(
          controller: controller,
          itemCount: widget.items.length,
          onPageChanged: (i) => setState(() => current = i),
          itemBuilder: (c, i) {
            final a = widget.items[i];
            return Padding(
              padding: AppInsets.pageTop,
              child: Material(
                color: Colors.transparent,
                child: InkWell(
                  onTap: () => context.push('/articles/${a.route}'),
                  borderRadius: AppRadius.rMd,
                  child: Ink(
                    decoration: BoxDecoration(
                      gradient: context.colors.heroWash,
                      borderRadius: AppRadius.rMd,
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
                              fontSize: AppType.heroWatermark,
                              fontWeight: FontWeight.w600,
                              color: context.colors.textTitle.withValues(
                                alpha: .08,
                              ),
                            ),
                          ),
                        ),
                        Padding(
                          padding: AppInsets.page,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                '焦点阅读',
                                style: TextStyle(
                                  fontSize: AppType.micro,
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
                                  fontSize: AppType.avatarLetter,
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
                                  fontSize: AppType.caption,
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
        padding: AppInsets.tagLabel,
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            _control('上一条焦点', 'back', () => step(-1)),
            Row(
              children: [
                for (var i = 0; i < widget.items.length; i++)
                  Container(
                    margin: AppInsets.metadataRight,
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
