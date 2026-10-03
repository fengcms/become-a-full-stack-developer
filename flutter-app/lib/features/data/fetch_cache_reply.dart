import '../../core/cache/data_cache.dart';
import '../../core/network/api_client.dart';

/// 把服务端缓存头与数据一起传给缓存层，网络层本身不决定是否复用。
Future<CacheReply> fetchCacheReply(
  ApiClient api,
  String path, {
  Map<String, dynamic> query = const {},
  bool anonymous = false,
}) async {
  String control = '';
  Duration age = Duration.zero;
  final data = await api.request(
    path,
    query: query,
    anonymous: anonymous,
    onHeaders: (headers) {
      control = headers.value('cache-control') ?? '';
      age = Duration(seconds: int.tryParse(headers.value('age') ?? '') ?? 0);
    },
  );
  return CacheReply(data, control: control, age: age);
}
