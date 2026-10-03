import 'package:dio/dio.dart';
import 'package:image_picker/image_picker.dart';

import '../network/api_client.dart';

Future<String> uploadImage(
  ApiClient api,
  XFile file, {
  void Function(int, int)? onProgress,
}) async {
  final ext = file.name.split('.').last.toLowerCase();
  const types = {
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'webp': 'image/webp',
    'gif': 'image/gif',
  };
  if (!types.containsKey(ext)) {
    throw const ApiFailure('请选择 PNG、JPG、GIF 或 WebP 图片');
  }
  if (await file.length() > 10 * 1024 * 1024) {
    throw const ApiFailure('图片不能超过 10MB');
  }
  final form = FormData.fromMap({
    'file': await MultipartFile.fromFile(
      file.path,
      filename: file.name,
      contentType: DioMediaType.parse(types[ext]!),
    ),
  });
  final result = await api.request(
    '/upload',
    method: 'POST',
    data: form,
    onSendProgress: onProgress,
  );
  return api.fileUrl(result['url'] as String);
}
