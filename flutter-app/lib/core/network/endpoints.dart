/// 后端端点目录。App 的导航路径不使用本类，避免两种路由误耦合。
abstract final class Endpoints {
  static const adjacentSuffix = '/adjacent';
  static const articles = '/articles';
  static const login = '/auth/login';
  static const logout = '/auth/logout';
  static const authMe = '/auth/me';
  static const refresh = '/auth/refresh';
  static const register = '/auth/register';
  static const categoriesStats = '/categories/stats';
  static const categoriesTree = '/categories/tree';
  static const commentsSuffix = '/comments';
  static const likeSuffix = '/like';
  static const likeStatusSuffix = '/like/status';
  static const meArticles = '/me/articles';
  static const meFavorites = '/me/favorites';
  static const meHistory = '/me/history';
  static const meLikes = '/me/likes';
  static const meNotifications = '/me/notifications';
  static const changePassword = '/me/change-password';
  static const profile = '/me/profile';
  static const search = '/search';
  static const siteSettings = '/site/settings';
  static const tags = '/tags';
  static const upload = '/upload';
  static const unreadCount = '/me/notifications/unread-count';
  static const readAllNotifications = '/me/notifications/read-all';
  static const memberPrefix = '/members/';
  static const privatePrefix = '/me/';
  static const commentPrefix = '/comments/';

  static String article(Object id) => '/articles/${Uri.encodeComponent('$id')}';
  static String toc(Object id) => '${article(id)}/toc';
  static String adjacent(Object id) => '${article(id)}/adjacent';
  static String like(Object id) => '${article(id)}/like';
  static String likeStatus(Object id) => '${like(id)}/status';
  static String comments(Object id) => '${article(id)}/comments';
  static String view(Object id) => '${article(id)}/view';
  static String favorite(Object id) => '$meFavorites/$id';
  static String comment(Object id) => '/comments/$id';
  static String member(Object id) => '/members/$id';
  static String submit(Object id) => '${article(id)}/submit';
  static String notification(Object id) => '$meNotifications/$id';
  static String collection(String kind) => '$privatePrefix$kind';
  static String collectionItem(String kind, Object id) =>
      '${collection(kind)}/$id';
  static String? articleId(String path) =>
      RegExp(r'^/articles/([^/]+)').firstMatch(path)?.group(1);
}
