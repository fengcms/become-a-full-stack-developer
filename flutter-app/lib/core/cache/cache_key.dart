import 'dart:convert';

/// 缓存身份包含接口环境、会话及完整查询；公共数据不会与账号数据共用键。
class CacheKey {
  const CacheKey(this.baseUrl, this.scope, this.path, this.query);
  final String baseUrl, scope, path;
  final Map<String, dynamic> query;

  /// 保留已发布的 v1 磁盘格式，排序使不同参数插入顺序命中同一条缓存。
  String encode() => jsonEncode([
    'v1',
    baseUrl,
    scope,
    path,
    Map.fromEntries(
      query.entries.toList()..sort((a, b) => a.key.compareTo(b.key)),
    ),
  ]);

  /// 损坏或旧版本键仅当作未命中；不能让磁盘索引阻断在线阅读。
  static CacheKey? tryParse(String value) {
    try {
      return switch (jsonDecode(value)) {
        ['v1', String base, String scope, String path, Map query] => CacheKey(
          base,
          scope,
          path,
          Map<String, dynamic>.from(query),
        ),
        _ => null,
      };
    } catch (_) {
      return null;
    }
  }
}
