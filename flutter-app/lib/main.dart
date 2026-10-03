import 'package:fullstack_reader/core/cache/cache_limits.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app/router.dart';
import 'app/session.dart';
import 'app/theme/app_theme.dart';
import 'core/network/api_client.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  PaintingBinding.instance.imageCache.maximumSizeBytes =
      CacheLimits.decodedImageBytes;
  const configured = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://api-befull.kao9.com/api/v1',
  );
  if (kReleaseMode && !configured.startsWith('https://')) {
    throw StateError('Release requires an HTTPS API_BASE_URL');
  }
  final api = ApiClient(
    baseUrl: configured,
    vault: SecureTokenVault(namespace: Uri.parse(configured).authority),
  );
  final session = AppSession(api, await SharedPreferences.getInstance());
  runApp(
    ProviderScope(
      overrides: [sessionProvider.overrideWith((ref) => session)],
      child: const ReaderApp(),
    ),
  );
  await session.restore();
}

/// 应用入口持有路由与两套主题，会话通知仅切换当前模式。
class ReaderApp extends ConsumerStatefulWidget {
  const ReaderApp({super.key});
  @override
  ConsumerState<ReaderApp> createState() => _ReaderAppState();
}

class _ReaderAppState extends ConsumerState<ReaderApp>
    with WidgetsBindingObserver {
  late final GoRouter router;
  late final lightTheme = buildAppTheme(Brightness.light);
  late final darkTheme = buildAppTheme(Brightness.dark);
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    router = createRouter(ref.read(sessionProvider));
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    router.dispose();
    super.dispose();
  }

  @override
  void didHaveMemoryPressure() {
    final repo = ref.read(repositoryProvider);
    repo.cache.trim();
    repo.images.trim();
    repo.snapshots.clear();
    PaintingBinding.instance.imageCache.clear();
  }

  @override
  Widget build(BuildContext context) => MaterialApp.router(
    title: '成为全栈',
    locale: const Locale('zh', 'CN'),
    supportedLocales: const [Locale('zh', 'CN'), Locale('en')],
    localizationsDelegates: GlobalMaterialLocalizations.delegates,
    debugShowCheckedModeBanner: false,
    theme: lightTheme,
    darkTheme: darkTheme,
    themeMode: ref.watch(sessionProvider).mode,
    routerConfig: router,
    builder: AppLayout.clampTextScale,
  );
}
