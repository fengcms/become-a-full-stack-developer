import 'package:flutter/material.dart';

/// 使用 IconData 而非字符串，保证 tree-shaking 生效、不引外部图标包。
class ArticleStatusView {
  const ArticleStatusView(this.label, this.icon);
  final String label;
  final IconData icon;

  static ArticleStatusView of(String status) => switch (status) {
    'published' => const ArticleStatusView('已发布', Icons.check_circle_outline),
    'pending' => const ArticleStatusView('待审核', Icons.schedule),
    'draft' => const ArticleStatusView('草稿', Icons.edit_note),
    'rejected' => const ArticleStatusView('未通过', Icons.error_outline),
    _ => ArticleStatusView(status, Icons.help_outline),
  };
}

// ---------------------------------------------------------------------------
// 错误分类文案（docs/flutter-app/01 §4：不得统一显示「加载失败」）
// ---------------------------------------------------------------------------

/// 错误展示保留网络、权限、限流与资源不存在的差异。
class ApiErrorView {
  const ApiErrorView(this.title, this.detail, this.icon);
  final String title;
  final String detail;
  final IconData icon;

  /// 传入后端业务码或网络错误类型，得到具体文案。
  static ApiErrorView of(Object error) => switch (error) {
    'offline' => const ApiErrorView(
      '网络不可用',
      '当前设备没有网络连接，已保留你正在浏览的内容。',
      Icons.wifi_off,
    ),
    'timeout' => const ApiErrorView(
      '请求超时',
      '服务器响应超过 15 秒，可以下拉刷新再试一次。',
      Icons.schedule,
    ),
    'e401' => const ApiErrorView(
      '登录已过期',
      '会话已失效，需要重新登录后继续。',
      Icons.lock_outline,
    ),
    'e403' => const ApiErrorView('没有访问权限', '当前账号无权查看该内容。', Icons.block),
    'e404' => const ApiErrorView(
      '内容不存在',
      '该内容可能已被删除或链接有误。',
      Icons.inbox_outlined,
    ),
    'e429' => const ApiErrorView(
      '请求过于频繁',
      '请稍后重试。公开列表与搜索接口有频率限制。',
      Icons.hourglass_empty,
    ),
    'e500' => const ApiErrorView(
      '服务器异常',
      '服务端暂时不可用，与你的操作无关。',
      Icons.error_outline,
    ),
    _ => const ApiErrorView('出了点问题', '请重试，若持续失败请稍后再来。', Icons.error_outline),
  };
}
