import 'dart:async';

import 'package:fullstack_reader/shared/prototype_icons.dart';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:fullstack_reader/app/session.dart';

import 'package:fullstack_reader/shared/widgets/reader_context.dart';

/// 图片请求身份包含会话代际，重建组件不会重复启动相同图片请求。
class ReaderImage extends ConsumerStatefulWidget {
  const ReaderImage(
    this.url, {
    super.key,
    this.width,
    this.height,
    this.public = false,
  });
  final String url;
  final double? width, height;
  final bool public;
  @override
  ConsumerState<ReaderImage> createState() => _ReaderImageState();
}

class _ReaderImageState extends ConsumerState<ReaderImage> {
  Future<dynamic>? future;
  String? identity;
  @override
  Widget build(BuildContext context) {
    final epoch = ref.watch(sessionProvider.select((s) => s.epoch));
    final repo = ref.read(repositoryProvider);
    final url = repo.api.fileUrl(widget.url);
    final next = '$url:${widget.public}:$epoch';
    if (identity != next) {
      identity = next;
      future = repo.images.load(url, public: widget.public, epoch: epoch);
    }
    return FutureBuilder<dynamic>(
      future: future,
      builder: (context, s) {
        if (s.hasData) {
          return Image.memory(
            s.data,
            width: widget.width,
            height: widget.height,
            fit: BoxFit.cover,
            cacheWidth: widget.width == null
                ? null
                : (widget.width! * MediaQuery.devicePixelRatioOf(context))
                      .ceil(),
            errorBuilder: (c, e, stack) => placeholder(error: true),
          );
        }
        return placeholder(error: s.hasError);
      },
    );
  }

  Widget placeholder({required bool error}) => Container(
    width: widget.width,
    height: widget.height ?? 100,
    color: context.colors.bgSubtle,
    child: Center(
      child: error
          ? IconButton(
              tooltip: '重试图片',
              icon: const ReaderIcon(Icons.broken_image_outlined),
              onPressed: () => setState(() {
                final repo = ref.read(repositoryProvider);
                future = repo.images.load(
                  repo.api.fileUrl(widget.url),
                  public: widget.public,
                  epoch: repo.api.epoch,
                  force: true,
                );
              }),
            )
          : const SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
    ),
  );
}
