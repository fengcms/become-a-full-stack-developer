import 'package:flutter/material.dart';

/// Revalidate only the visible route on tab/route return or app resume.
mixin CacheVisibility<T extends StatefulWidget> on State<T> {
  late final _CacheObserver _observer = _CacheObserver(
    didChangeAppLifecycleState,
  );
  bool _visible = false;
  DateTime? _resumed;
  bool get cacheVisible =>
      mounted &&
      TickerMode.valuesOf(context).enabled &&
      (ModalRoute.isCurrentOf(context) ?? true);
  void onCacheVisible();
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(_observer);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final visible = cacheVisible;
    if (visible && !_visible) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && cacheVisible) onCacheVisible();
      });
    }
    _visible = visible;
  }

  void didChangeAppLifecycleState(AppLifecycleState state) {
    final now = DateTime.now();
    if (state == AppLifecycleState.resumed &&
        cacheVisible &&
        (_resumed == null ||
            now.difference(_resumed!) > const Duration(seconds: 30))) {
      _resumed = now;
      onCacheVisible();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(_observer);
    super.dispose();
  }
}

class _CacheObserver extends WidgetsBindingObserver {
  _CacheObserver(this.change);
  final void Function(AppLifecycleState) change;
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) => change(state);
}
