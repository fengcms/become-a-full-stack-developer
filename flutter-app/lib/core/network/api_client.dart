import 'package:fullstack_reader/core/network/endpoints.dart';

import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:dio/io.dart';

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// 令牌存储接口允许测试替换为内存实现，业务代码不接触存储细节。
abstract interface class TokenVault {
  Future<String?> read();
  Future<void> write(String? token);
}

/// 按接口环境隔离安全存储中的刷新令牌，避免开发与线上会话互相覆盖。
class SecureTokenVault implements TokenVault {
  SecureTokenVault({this.namespace = "local"});
  final String namespace;
  String get key => "reader.refresh.$namespace";
  final FlutterSecureStorage storage = const FlutterSecureStorage();
  @override
  Future<String?> read() => storage.read(key: key);
  @override
  Future<void> write(String? token) => token == null
      ? storage.delete(key: key)
      : storage.write(key: key, value: token);
}

/// 保留 HTTP 状态、业务码和字段错误，界面可以区分权限、冲突与网络失败。
class ApiFailure implements Exception {
  const ApiFailure(
    this.message, {
    this.code = 0,
    this.status = 0,
    this.retryAfter,
    this.fields = const {},
  });
  final String message;
  final int code, status;
  final int? retryAfter;
  final Map<String, String> fields;
  @override
  String toString() => message;
}

/// 请求期间账号发生变化的控制信号；页面应忽略旧响应而非提示网络错误。
class SessionChanged implements Exception {}

/// 统一鉴权、单次刷新与 GET 限流重试；不承担页面缓存策略。
class ApiClient {
  ApiClient({required this.baseUrl, required this.vault, Dio? transport})
    : dio = transport ?? Dio() {
    // Explicit, debug-only networking for a developer's emulator. TLS validation stays enabled.
    const proxy = String.fromEnvironment('DEV_HTTP_PROXY');
    if (kDebugMode && proxy.isNotEmpty && transport == null) {
      dio.httpClientAdapter = IOHttpClientAdapter(
        createHttpClient: () => HttpClient()..findProxy = (_) => 'PROXY $proxy',
      );
    }
    dio.options = BaseOptions(
      baseUrl: baseUrl,
      connectTimeout: const Duration(seconds: 12),
      receiveTimeout: const Duration(seconds: 20),
      validateStatus: (_) => true,
    );
  }
  final String baseUrl;
  final TokenVault vault;
  final Dio dio;
  String? accessToken;
  int epoch = 0;
  int? userId;
  void Function()? onSessionChanged;
  void Function(
    String path,
    String method,
    Object? data,
    bool started,
    dynamic result,
    Object? error,
  )?
  onMutation;
  Future<void>? _refresh;
  Future<void> _storageQueue = Future.value();
  void Function()? onExpired;
  Future<void> _persist(String? token) {
    final next = _storageQueue
        .catchError((Object _) {})
        .then((_) => vault.write(token));
    _storageQueue = next;
    return next;
  }

  Future<void> install(Map<String, dynamic> auth, {int? expectedEpoch}) async {
    if (expectedEpoch != null && expectedEpoch != epoch) throw SessionChanged();
    final token = auth['refreshToken'] as String?;
    if (token == null || token.isEmpty) {
      throw const ApiFailure('服务未返回刷新令牌，请重新登录');
    }
    await _persist(token);
    if (expectedEpoch != null && expectedEpoch != epoch) throw SessionChanged();
    accessToken = auth['accessToken'] as String;
    if (auth['user'] is Map) userId = (auth['user']['id'] as num?)?.toInt();
  }

  // 清除会话先提升代际，使刷新和旧请求不能重新写入已退出的令牌。
  Future<void> clear() async {
    epoch++;
    accessToken = null;
    userId = null;
    onSessionChanged?.call();
    await _persist(null);
  }

  Future<void> refresh() {
    if (_refresh != null) return _refresh!;
    final start = epoch;
    final task = () async {
      try {
        final token = await vault.read();
        if (start != epoch) throw SessionChanged();
        if (token == null) {
          throw const ApiFailure('请登录后继续', code: 1004, status: 401);
        }
        final data = await request(
          Endpoints.refresh,
          method: 'POST',
          data: {'refreshToken': token},
          refreshAllowed: false,
        );
        await install(
          Map<String, dynamic>.from(data as Map),
          expectedEpoch: start,
        );
      } on ApiFailure catch (e) {
        if ([1002, 1003, 1004, 1005].contains(e.code) && start == epoch) {
          await clear();
          onExpired?.call();
        }
        rethrow;
      }
    }();
    _refresh = task;
    return task.whenComplete(() {
      if (identical(_refresh, task)) _refresh = null;
    });
  }

  // 写操作的开始与完成事件成对发送，仓库由此维护缓存栅栏。
  Future<dynamic> request(
    String path, {
    String method = 'GET',
    Object? data,
    Map<String, dynamic>? query,
    bool refreshAllowed = true,
    bool anonymous = false,
    void Function(int, int)? onSendProgress,
    void Function(Headers)? onHeaders,
  }) async {
    final mutation =
        method != 'GET' &&
        !path.startsWith(Endpoints.authPrefix) &&
        !path.startsWith(Endpoints.filesPrefix) &&
        !path.endsWith(Endpoints.viewSuffix);
    if (mutation) onMutation?.call(path, method, data, true, null, null);
    try {
      final result = await _request(
        path,
        method: method,
        data: data,
        query: query,
        refreshAllowed: refreshAllowed,
        anonymous: anonymous,
        onSendProgress: onSendProgress,
        onHeaders: onHeaders,
      );
      if (mutation) onMutation?.call(path, method, data, false, result, null);
      return result;
    } catch (e) {
      if (mutation) onMutation?.call(path, method, data, false, null, e);
      rethrow;
    }
  }

  Future<dynamic> _request(
    String path, {
    String method = 'GET',
    Object? data,
    Map<String, dynamic>? query,
    bool refreshAllowed = true,
    void Function(int, int)? onSendProgress,
    bool anonymous = false,
    void Function(Headers)? onHeaders,
  }) async {
    final start = epoch;
    final originalToken = accessToken;
    try {
      Response<dynamic> response = await dio.request(
        path,
        data: data,
        queryParameters: query,
        options: Options(
          method: method,
          headers: {
            if (!anonymous && accessToken != null)
              'Authorization': 'Bearer $accessToken',
          },
        ),
        onSendProgress: onSendProgress,
      );
      if (start != epoch) throw SessionChanged();
      var body = response.data;
      if (response.statusCode == 401 &&
          refreshAllowed &&
          !anonymous &&
          body is Map &&
          body['code'] == 1002) {
        if (originalToken == accessToken) await refresh();
        if (start != epoch) throw SessionChanged();
        return await _request(
          path,
          method: method,
          data: data is FormData ? data.clone() : data,
          query: query,
          refreshAllowed: false,
          onSendProgress: onSendProgress,
          anonymous: anonymous,
          onHeaders: onHeaders,
        );
      }
      // Only read requests may retry a short server-declared cooldown, once.
      final seconds = int.tryParse(response.headers.value('retry-after') ?? '');
      // 只对 GET 做一次有界等待；写请求绝不自动重放。
      if (response.statusCode == 429 &&
          method == 'GET' &&
          seconds != null &&
          seconds >= 0 &&
          seconds <= 3) {
        await Future<void>.delayed(Duration(seconds: seconds));
        if (start != epoch) throw SessionChanged();
        response = await dio.request(
          path,
          queryParameters: query,
          options: Options(
            method: method,
            headers: {
              if (!anonymous && accessToken != null)
                'Authorization': 'Bearer $accessToken',
            },
          ),
        );
        if (start != epoch) throw SessionChanged();
        body = response.data;
      }
      if (body is! Map) throw const ApiFailure('服务器返回了无法识别的数据', status: 500);
      final code = (body['code'] as num?)?.toInt() ?? 5000;
      if (code != 0) {
        if ([1003, 1005].contains(code) && start == epoch) {
          await clear();
          onExpired?.call();
        }
        final fields = <String, String>{};
        if (body['data'] is Map) {
          for (final e in ((body['data'] as Map)['errors'] as List? ?? [])) {
            if (e is Map) fields['${e['field']}'] = '${e['message']}';
          }
        }
        const messages = {
          1001: '用户名或密码不正确',
          1002: '登录已过期，请重新登录',
          1003: '会话已失效，请重新登录',
          1004: '请登录后继续',
          1005: '账号已停用',
          2001: '你没有操作此内容的权限',
          3001: '内容不存在或暂不可见',
          3002: '内容存在冲突，请检查后重试',
          3003: '稿件状态已变化，请刷新后重试',
          4001: '请检查填写的内容',
          5000: '服务暂时不可用，请稍后重试',
          5001: '请求较多，请稍后重试',
        };
        throw ApiFailure(
          fields.isNotEmpty
              ? fields.values.join('\n')
              : messages[code] ?? '请求未能完成',
          code: code,
          status: response.statusCode ?? 0,
          retryAfter: int.tryParse(response.headers.value('retry-after') ?? ''),
          fields: fields,
        );
      }
      onHeaders?.call(response.headers);
      return body['data'];
    } on DioException catch (e) {
      if (start != epoch) throw SessionChanged();
      throw ApiFailure(switch (e.type) {
        DioExceptionType.connectionTimeout ||
        DioExceptionType.receiveTimeout ||
        DioExceptionType.sendTimeout => '连接超时，请重试',
        _ => '网络连接不可用，请检查网络后重试',
      });
    }
  }

  // 服务端相对地址基于 API 环境解析，只允许可展示的 HTTP/HTTPS 资源。
  String fileUrl(String value) {
    final u = Uri.tryParse(value);
    if (u == null) return '';
    if (u.hasScheme) return ['http', 'https'].contains(u.scheme) ? value : '';
    return Uri.parse(baseUrl).resolve(value).toString();
  }
}
