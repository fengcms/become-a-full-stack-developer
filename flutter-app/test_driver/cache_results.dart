import 'dart:convert';
import 'dart:io';

import 'package:integration_test/integration_test_driver_extended.dart';

Future<void> main() => integrationDriver(
  responseDataCallback: (data) async {
    final file = File(
      Platform.environment['FLUTTER_CACHE_EVIDENCE'] ??
          '../docs/flutter-app/evidence/cache-acceptance.json',
    );
    await file.parent.create(recursive: true);
    await file.writeAsString(const JsonEncoder.withIndent('  ').convert(data));
  },
);
