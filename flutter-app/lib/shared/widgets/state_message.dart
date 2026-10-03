import 'package:fullstack_reader/app/theme/app_theme.dart';

import 'package:fullstack_reader/shared/prototype_icons.dart';

import 'package:flutter/material.dart';

import 'package:fullstack_reader/shared/widgets/reader_context.dart';

/// 空内容与加载错误使用不同文案，重试行为由调用页面提供。
class StateMessage extends StatelessWidget {
  const StateMessage({
    super.key,
    this.error,
    this.title = '这里还没有内容',
    this.description = '新的内容发布后，会出现在这里。',
    this.onRetry,
  });
  final Object? error;
  final String title, description;
  final VoidCallback? onRetry;
  @override
  Widget build(BuildContext context) => Padding(
    padding: AppInsets.emptyState,
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        CircleAvatar(
          radius: 36,
          backgroundColor: context.colors.brandSubtle,
          child: ReaderIcon(
            error == null ? Icons.inbox_outlined : Icons.cloud_off_outlined,
            size: 32,
            color: context.colors.brand,
          ),
        ),
        const SizedBox(height: 16),
        Text(
          error == null ? title : '暂时无法显示',
          style: context.text.titleLarge,
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 8),
        Text(
          error?.toString() ?? description,
          textAlign: TextAlign.center,
          style: context.text.bodySmall,
        ),
        if (onRetry != null) ...[
          const SizedBox(height: 20),
          OutlinedButton(onPressed: onRetry, child: const Text('重新加载')),
        ],
      ],
    ),
  );
}
