import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/legacy.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/network/api_client.dart';
import '../core/cache/data_cache.dart';
import '../core/generated/models.dart';
import '../features/repository.dart';

final sessionProvider = ChangeNotifierProvider<AppSession>(
  (ref) => throw UnimplementedError('Bootstrap must override session'),
);
final repositoryProvider = Provider(
  (ref) => ref.read(sessionProvider).repository,
);

class AppSession extends ChangeNotifier {
  AppSession(this.api, this.preferences, {DataCache? cache}) {
    repository = ReaderRepository(
      api,
      cache: cache,
    ); // Install mutation and identity hooks before the first request.
    mode = ThemeMode.values[preferences.getInt('themeMode')?.clamp(0, 2) ?? 0];
    api.onExpired = () {
      user = null;
      PaintingBinding.instance.imageCache.clear();
      notifyListeners();
    };
  }
  final ApiClient api;
  late final ReaderRepository repository;
  final SharedPreferences preferences;
  ApiUser? user;
  bool restoring = true;
  String? restoreError;
  ThemeMode mode = ThemeMode.system;
  int get epoch => api.epoch;
  Future<void> restore() async {
    try {
      if (await api.vault.read() != null) {
        await api.refresh();
        user = ApiUser.fromJson(
          Map<String, dynamic>.from(await api.request('/auth/me') as Map),
        );
        api.userId = user?.id;
      }
    } on ApiFailure catch (e) {
      restoreError = e.message;
    } on SessionChanged {
      // A newer login or logout superseded this restoration.
    } finally {
      restoring = false;
      notifyListeners();
    }
  }

  Future<void> authenticate(
    Map<String, dynamic> data, {
    bool register = false,
  }) async {
    await api.clear();
    user = null;
    PaintingBinding.instance.imageCache.clear();
    notifyListeners();
    final start = epoch;
    final result = Map<String, dynamic>.from(
      await api.request(
        register ? '/auth/register' : '/auth/login',
        method: 'POST',
        data: data,
        refreshAllowed: false,
      ) as Map,
    );
    await api.install(result, expectedEpoch: start);
    user = ApiUser.fromJson(Map<String, dynamic>.from(result['user'] as Map));
    restoreError = null;
    notifyListeners();
  }

  Future<void> logout() async {
    try {
      await api.request('/auth/logout', method: 'POST');
    } finally {
      await api.clear();
      user = null;
      PaintingBinding.instance.imageCache.clear();
      notifyListeners();
    }
  }

  Future<void> expire() async {
    await api.clear();
    user = null;
    PaintingBinding.instance.imageCache.clear();
    notifyListeners();
  }

  Future<void> reloadUser() async {
    user = ApiUser.fromJson(
      Map<String, dynamic>.from(await api.request('/me/profile') as Map),
    );
    notifyListeners();
  }

  Future<void> setTheme(ThemeMode value) async {
    mode = value;
    notifyListeners();
    await preferences.setInt('themeMode', value.index);
  }
}

final unreadCountProvider = FutureProvider<int>((ref) async {
  final identity = ref.watch(
    sessionProvider.select((s) => (s.user?.id, s.epoch)),
  );
  if (identity.$1 == null) return 0;
  final data = await ref
      .read(sessionProvider)
      .repository
      .read('/me/notifications/unread-count');
  return (data['count'] as num?)?.toInt() ?? 0;
});

final reactionRevisionProvider = StreamProvider<int>(
  (ref) => ref.read(repositoryProvider).reactionEvents,
);
