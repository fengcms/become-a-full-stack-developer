import 'dart:async';

import 'package:fullstack_reader/shared/prototype_icons.dart';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:fullstack_reader/app/session.dart';
import 'package:fullstack_reader/shared/widgets/reader_context.dart';

Future<void> chooseTheme(BuildContext context, WidgetRef ref) =>
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (c) => Consumer(
        builder: (c, ref, _) => SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('外观设置', style: c.text.titleLarge),
              for (final mode in ThemeMode.values)
                ListTile(
                  leading: ReaderIcon(switch (mode) {
                    ThemeMode.system => Icons.brightness_auto_outlined,
                    ThemeMode.light => Icons.light_mode_outlined,
                    ThemeMode.dark => Icons.dark_mode_outlined,
                  }),
                  title: Text(switch (mode) {
                    ThemeMode.system => '跟随系统',
                    ThemeMode.light => '浅色模式',
                    ThemeMode.dark => '深色模式',
                  }),
                  trailing: ref.watch(sessionProvider).mode == mode
                      ? const ReaderIcon(Icons.check)
                      : null,
                  onTap: () {
                    ref.read(sessionProvider).setTheme(mode);
                    Navigator.pop(c);
                  },
                ),
            ],
          ),
        ),
      ),
    );
