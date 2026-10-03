import 'package:fullstack_reader/app/theme/app_theme.dart';
import 'package:flutter/material.dart';

import 'package:fullstack_reader/shared/widgets/reader_context.dart';

/// 首屏骨架只占位，不承载请求状态或缓存逻辑。
class ArticleSkeleton extends StatelessWidget {
  const ArticleSkeleton({super.key, this.count = 3});
  final int count;
  @override
  Widget build(BuildContext context) => Column(
    children: [
      for (var i = 0; i < count; i++)
        Container(
          padding: AppInsets.page,
          decoration: BoxDecoration(
            border: Border(bottom: BorderSide(color: context.colors.line)),
          ),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    for (final width in [.82, 1.0, .45])
                      Padding(
                        padding: AppInsets.formBottom,
                        child: FractionallySizedBox(
                          widthFactor: width,
                          child: Container(
                            height: 14,
                            decoration: BoxDecoration(
                              color: context.colors.skeleton,
                              borderRadius: AppRadius.rXs,
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Container(
                width: 96,
                height: 72,
                decoration: BoxDecoration(
                  color: context.colors.skeleton,
                  borderRadius: AppRadius.rXs,
                ),
              ),
            ],
          ),
        ),
    ],
  );
}
