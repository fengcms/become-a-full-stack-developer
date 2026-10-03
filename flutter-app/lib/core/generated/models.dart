// Generated from docs/api/openapi.v1.yaml. Run node tool/generate_contract.mjs.

class ApiArticle {
  ApiArticle.fromJson(Map<String, dynamic> value)
    : json = Map.unmodifiable(value);
  final Map<String, dynamic> json;
  int? get id => (json['id'] as num?)?.toInt();
  String? get title => json['title'] as String?;
  String? get slug => json['slug'] as String?;
  String? get summary => json['summary'] as String?;
  String? get content => json['content'] as String?;
  String? get coverImage => json['coverImage'] as String?;
  int? get authorId => (json['authorId'] as num?)?.toInt();
  String? get authorName => json['authorName'] as String?;
  int? get categoryId => (json['categoryId'] as num?)?.toInt();
  String? get categoryName => json['categoryName'] as String?;
  List<String> get tags =>
      (json['tags'] as List? ?? []).map((e) => e.toString()).toList();
  String? get status => json['status'] as String?;
  int? get viewCount => (json['viewCount'] as num?)?.toInt();
  int? get likeCount => (json['likeCount'] as num?)?.toInt();
  String? get publishedAt => json['publishedAt'] as String?;
  String? get createdAt => json['createdAt'] as String?;
  String? get updatedAt => json['updatedAt'] as String?;
}

class ApiArticleSummary {
  ApiArticleSummary.fromJson(Map<String, dynamic> value)
    : json = Map.unmodifiable(value);
  final Map<String, dynamic> json;
  int? get id => (json['id'] as num?)?.toInt();
  String? get title => json['title'] as String?;
  String? get slug => json['slug'] as String?;
  String? get summary => json['summary'] as String?;
  String? get coverImage => json['coverImage'] as String?;
  int? get authorId => (json['authorId'] as num?)?.toInt();
  String? get authorName => json['authorName'] as String?;
  int? get categoryId => (json['categoryId'] as num?)?.toInt();
  String? get categoryName => json['categoryName'] as String?;
  List<String> get tags =>
      (json['tags'] as List? ?? []).map((e) => e.toString()).toList();
  String? get status => json['status'] as String?;
  int? get viewCount => (json['viewCount'] as num?)?.toInt();
  int? get likeCount => (json['likeCount'] as num?)?.toInt();
  String? get publishedAt => json['publishedAt'] as String?;
  String? get createdAt => json['createdAt'] as String?;
  String? get updatedAt => json['updatedAt'] as String?;
}

class ApiUser {
  ApiUser.fromJson(Map<String, dynamic> value) : json = Map.unmodifiable(value);
  final Map<String, dynamic> json;
  int? get id => (json['id'] as num?)?.toInt();
  String? get username => json['username'] as String?;
  String? get email => json['email'] as String?;
  String? get nickname => json['nickname'] as String?;
  String? get avatar => json['avatar'] as String?;
  String? get role => json['role'] as String?;
  String? get status => json['status'] as String?;
  int? get level => (json['level'] as num?)?.toInt();
  String? get createdAt => json['createdAt'] as String?;
}

class ApiComment {
  ApiComment.fromJson(Map<String, dynamic> value)
    : json = Map.unmodifiable(value);
  final Map<String, dynamic> json;
  int? get id => (json['id'] as num?)?.toInt();
  int? get articleId => (json['articleId'] as num?)?.toInt();
  int? get userId => (json['userId'] as num?)?.toInt();
  String? get userName => json['userName'] as String?;
  int? get parentId => (json['parentId'] as num?)?.toInt();
  String? get content => json['content'] as String?;
  String? get status => json['status'] as String?;
  String? get rejectedReason => json['rejectedReason'] as String?;
  String? get createdAt => json['createdAt'] as String?;
}

class ApiCategoryNode {
  ApiCategoryNode.fromJson(Map<String, dynamic> value)
    : json = Map.unmodifiable(value);
  final Map<String, dynamic> json;
  int? get id => (json['id'] as num?)?.toInt();
  String? get name => json['name'] as String?;
  String? get slug => json['slug'] as String?;
  String? get description => json['description'] as String?;
  int? get sortOrder => (json['sortOrder'] as num?)?.toInt();
  List<ApiCategoryNode> get children => (json['children'] as List? ?? [])
      .map((e) => ApiCategoryNode.fromJson(Map<String, dynamic>.from(e as Map)))
      .toList();
}

class ApiTag {
  ApiTag.fromJson(Map<String, dynamic> value) : json = Map.unmodifiable(value);
  final Map<String, dynamic> json;
  int? get id => (json['id'] as num?)?.toInt();
  String? get name => json['name'] as String?;
  String? get slug => json['slug'] as String?;
  int? get articleCount => (json['articleCount'] as num?)?.toInt();
}

class ApiTocItem {
  ApiTocItem.fromJson(Map<String, dynamic> value)
    : json = Map.unmodifiable(value);
  final Map<String, dynamic> json;
  int? get level => (json['level'] as num?)?.toInt();
  String? get text => json['text'] as String?;
  String? get anchor => json['anchor'] as String?;
}

class ApiNotification {
  ApiNotification.fromJson(Map<String, dynamic> value)
    : json = Map.unmodifiable(value);
  final Map<String, dynamic> json;
  int? get id => (json['id'] as num?)?.toInt();
  int? get userId => (json['userId'] as num?)?.toInt();
  String? get type => json['type'] as String?;
  String? get title => json['title'] as String?;
  String? get body => json['body'] as String?;
  String? get link => json['link'] as String?;
  bool? get isRead => json['isRead'] as bool?;
  String? get createdAt => json['createdAt'] as String?;
}

class ApiPagination {
  ApiPagination.fromJson(Map<String, dynamic> value)
    : json = Map.unmodifiable(value);
  final Map<String, dynamic> json;
  int? get page => (json['page'] as num?)?.toInt();
  int? get pageSize => (json['pageSize'] as num?)?.toInt();
  int? get total => (json['total'] as num?)?.toInt();
  int? get totalPages => (json['totalPages'] as num?)?.toInt();
}

class ApiAuthResult {
  ApiAuthResult.fromJson(Map<String, dynamic> value)
    : json = Map.unmodifiable(value);
  final Map<String, dynamic> json;
  String? get accessToken => json['accessToken'] as String?;
  int? get expiresIn => (json['expiresIn'] as num?)?.toInt();
  String? get refreshToken => json['refreshToken'] as String?;
  ApiUser? get user => json['user'] == null
      ? null
      : ApiUser.fromJson(Map<String, dynamic>.from(json['user'] as Map));
}
