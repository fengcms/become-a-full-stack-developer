import 'package:fullstack_reader/app/theme/app_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:fullstack_reader/app/session.dart';
import 'package:fullstack_reader/shared/widgets/async_pane.dart';
import 'package:fullstack_reader/shared/widgets/cell_group.dart';
import 'package:fullstack_reader/shared/widgets/confirm.dart';
import 'package:fullstack_reader/shared/widgets/menu_cell.dart';
import 'package:fullstack_reader/shared/widgets/notice.dart';
import 'package:fullstack_reader/shared/widgets/page_frame.dart';
import 'package:fullstack_reader/shared/widgets/reader_context.dart';
import 'package:fullstack_reader/shared/widgets/section_title.dart';

part 'appearance_options.dart';

part 'account_options.dart';

/// 管理主题、账号和可重建缓存；清理缓存不会删除投稿草稿。
class SettingsPage extends ConsumerWidget {
  const SettingsPage({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider);
    return PageFrame(
      title: '设置',
      child: ListView(
        children: [
          const SectionTitle('外观'),
          _AppearanceOptions(session: session),
          const SectionTitle('账号'),
          _AccountOptions(session: session),
          const SectionTitle('存储'),
          CellGroup(
            children: [
              AsyncPane<int>(
                load: ref.read(repositoryProvider).cacheBytes,
                builder: (bytes, reload) => MenuCell(
                  '清理缓存',
                  'refresh',
                  subtitle:
                      '${(bytes / 1024 / 1024).toStringAsFixed(1)} MB · 保留登录、草稿、主题和搜索历史',
                  onTap: () async {
                    await ref.read(repositoryProvider).clear();
                    PaintingBinding.instance.imageCache.clear();
                    PaintingBinding.instance.imageCache.clearLiveImages();
                    await reload();
                    if (context.mounted) notice(context, '缓存已清理');
                  },
                ),
              ),
            ],
          ),
          const SectionTitle('关于'),
          const CellGroup(
            children: [
              MenuCell(
                '版本',
                'layers',
                trailing: Text(
                  'v1.0.0',
                  style: TextStyle(fontSize: AppType.caption),
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}
