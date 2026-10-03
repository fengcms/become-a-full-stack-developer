import 'dart:async';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../shared/prototype_icons.dart';
import '../shared/widgets.dart';

bool isWebAddress(Uri uri) =>
    (uri.scheme == 'https' || uri.scheme == 'http') && uri.host.isNotEmpty;

/// A single app route: web navigation never adds entries to the app back stack.
class WebPage extends StatefulWidget {
  const WebPage({super.key, required this.url});
  final Uri url;

  @override
  State<WebPage> createState() => _WebPageState();
}

class _WebPageState extends State<WebPage> {
  WebViewController? controller;
  Timer? titleTimer;
  late Uri currentUrl = widget.url;
  String? title;
  String? error;
  int progress = 0;
  bool readingTitle = false;

  @override
  void initState() {
    super.initState();
    if (!isWebAddress(widget.url)) {
      error = '此链接不是有效的网页地址';
      return;
    }
    initialize();
  }

  Future<void> initialize() async {
    try {
      final web = WebViewController();
      controller = web;
      await web.setJavaScriptMode(JavaScriptMode.unrestricted);
      await web.setNavigationDelegate(
        NavigationDelegate(
          onNavigationRequest: (request) {
            final uri = Uri.tryParse(request.url);
            if (uri != null && isWebAddress(uri)) {
              return NavigationDecision.navigate;
            }
            if (request.isMainFrame && mounted) {
              notice(context, '此链接暂不支持在网页中打开');
            }
            return NavigationDecision.prevent;
          },
          onPageStarted: (url) {
            if (!mounted) return;
            setState(() {
              currentUrl = Uri.tryParse(url) ?? currentUrl;
              title = null;
              error = null;
              progress = 0;
            });
          },
          onUrlChange: (change) {
            final uri = Uri.tryParse(change.url ?? '');
            if (!mounted || uri == null || !isWebAddress(uri)) return;
            setState(() => currentUrl = uri);
            updateTitle();
          },
          onProgress: (value) {
            if (mounted) setState(() => progress = value);
          },
          onPageFinished: (_) {
            if (mounted) setState(() => progress = 100);
            updateTitle();
          },
          onWebResourceError: (failure) {
            if (mounted && failure.isForMainFrame == true) {
              setState(() {
                error = '网页加载失败，请重试';
                progress = 100;
              });
            }
          },
        ),
      );
      if (!mounted) return;
      setState(() {});
      await web.loadRequest(widget.url);
      // Also follow document.title changes made by single-page websites.
      if (mounted) {
        titleTimer = Timer.periodic(
          const Duration(seconds: 1),
          (_) => updateTitle(),
        );
      }
    } catch (_) {
      if (mounted) setState(() => error = '网页加载失败，请重试');
    }
  }

  Future<void> updateTitle() async {
    if (readingTitle || controller == null || !mounted) return;
    readingTitle = true;
    final url = currentUrl;
    try {
      final next = (await controller!.getTitle())?.trim();
      if (mounted && url == currentUrl && next != title) {
        setState(() => title = next?.isNotEmpty == true ? next : null);
      }
    } catch (_) {
      // A page may be navigating or the platform view may be closing.
    } finally {
      readingTitle = false;
    }
  }

  Future<void> openInBrowser() async {
    try {
      final actual =
          Uri.tryParse(await controller?.currentUrl() ?? '') ?? currentUrl;
      final uri = isWebAddress(actual) ? actual : currentUrl;
      if (!isWebAddress(uri) ||
          !await launchUrl(uri, mode: LaunchMode.externalApplication)) {
        if (mounted) notice(context, '无法打开系统浏览器');
      }
    } catch (_) {
      if (mounted) notice(context, '无法打开系统浏览器');
    }
  }

  Future<void> retry() async {
    setState(() {
      error = null;
      progress = 0;
    });
    if (controller == null) {
      await initialize();
      return;
    }
    try {
      await controller!.loadRequest(currentUrl);
    } catch (_) {
      if (mounted) setState(() => error = '网页加载失败，请重试');
    }
  }

  @override
  void dispose() {
    titleTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      centerTitle: true,
      leading: IconButton(
        tooltip: '返回',
        icon: const PrototypeIcon('back'),
        onPressed: () => Navigator.of(context).pop(),
      ),
      title: Text(
        title ?? (currentUrl.host.isEmpty ? '网页' : currentUrl.host),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
      actions: [
        PopupMenuButton<String>(
          tooltip: '网页菜单',
          icon: const PrototypeIcon('more'),
          onSelected: (value) {
            if (value == 'close') {
              Navigator.of(context).pop();
            } else {
              openInBrowser();
            }
          },
          itemBuilder: (_) => const [
            PopupMenuItem(value: 'close', child: Text('关闭网页')),
            PopupMenuItem(value: 'browser', child: Text('在系统浏览器打开')),
          ],
        ),
      ],
    ),
    body: SafeArea(
      top: false,
      child: Stack(
        children: [
          if (controller != null)
            Positioned.fill(child: WebViewWidget(controller: controller!)),
          if (progress < 100 && error == null)
            LinearProgressIndicator(
              value: progress == 0 ? null : progress / 100,
              minHeight: 2,
            ),
          if (error != null)
            Positioned.fill(
              child: ColoredBox(
                color: context.colors.surface,
                child: Center(
                  child: StateMessage(
                    title: error!,
                    onRetry: isWebAddress(widget.url) ? retry : null,
                  ),
                ),
              ),
            ),
        ],
      ),
    ),
  );
}
