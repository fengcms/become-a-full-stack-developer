import 'dart:io';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fullstack_reader/core/cache/blob_store.dart';
import 'package:fullstack_reader/core/cache/image_store.dart';

import 'widget_test.dart' show Adapter;

void main() {
  test(
    'public image reuses disk, private and signed images never persist',
    () async {
      final root = await Directory.systemTemp.createTemp('reader-images-');
      addTearDown(() => root.delete(recursive: true));
      int calls = 0;
      final dio = Dio()
        ..httpClientAdapter = Adapter((o) {
          calls++;
          return ResponseBody.fromBytes(
            Uint8List.fromList([1, 2, 3]),
            200,
            headers: {
              'cache-control': ['max-age=3600'],
            },
          );
        });
      BlobStore disk() => BlobStore('images', directory: root, maxBytes: 10000);
      final first = ImageStore(dio, disk: disk(), namespace: 'env');
      await first.load(
        'https://example.com/public.png',
        public: true,
        epoch: 0,
      );
      await first.disk.size();
      final second = ImageStore(dio, disk: disk(), namespace: 'env');
      expect(
        await second.load(
          'https://example.com/public.png',
          public: true,
          epoch: 0,
        ),
        [1, 2, 3],
      );
      expect(calls, 1);
      await second.load(
        'https://example.com/avatar.png',
        public: false,
        epoch: 0,
      );
      expect(
        await second.disk.read(
          second.key('https://example.com/avatar.png', false, 0),
        ),
        isNull,
      );
      await second.load(
        'https://example.com/signed.png?token=secret',
        public: true,
        epoch: 0,
      );
      expect(
        await second.disk.read(
          second.key('https://example.com/signed.png?token=secret', true, 0),
        ),
        isNull,
      );
      second.resetPrivate();
      await second.load(
        'https://example.com/avatar.png',
        public: false,
        epoch: 1,
      );
      expect(calls, 4);
    },
  );
  test('no-store images are fetched again and never enter disk', () async {
    final root = await Directory.systemTemp.createTemp(
      'reader-image-no-store-',
    );
    addTearDown(() => root.delete(recursive: true));
    int calls = 0;
    final dio = Dio()
      ..httpClientAdapter = Adapter((o) {
        calls++;
        return ResponseBody.fromBytes(
          [1, 2],
          200,
          headers: {
            'cache-control': ['no-store'],
          },
        );
      });
    final images = ImageStore(
      dio,
      disk: BlobStore('images', directory: root, maxBytes: 10000),
    );
    await images.load('https://example.com/a.png', public: true, epoch: 0);
    await images.load('https://example.com/a.png', public: true, epoch: 0);
    expect(calls, 2);
    expect(await images.disk.size(), 0);
  });
}
