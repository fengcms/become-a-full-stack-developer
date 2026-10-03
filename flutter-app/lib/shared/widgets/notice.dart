import 'package:fullstack_reader/app/theme/app_theme.dart';
import 'package:flutter/material.dart';

import 'package:fullstack_reader/core/network/api_client.dart';

void notice(BuildContext context, Object error) {
  if (error is SessionChanged) return;
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      content: Text(error.toString()),
      duration: const Duration(seconds: 2),
      behavior: SnackBarBehavior.floating,
      margin: AppInsets.floatingNotice,
    ),
  );
}
