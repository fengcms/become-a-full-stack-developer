/// 可重建缓存的容量预算；本地投稿草稿不在这些清理范围内。
abstract final class CacheLimits {
  static const mib = 1024 * 1024;
  static const memoryEntries = 300;
  static const memoryBytes = 20 * mib;
  static const dataDiskBytes = 30 * mib;
  static const dataDiskEntries = 300;
  static const articleBodies = 100;
  static const searches = 20;
  static const trackedKeys = 1000;
  static const diskEntryBytes = 2 * mib;
  static const articleAliases = 300;
  static const reactions = 300;
  static const favoriteOverrides = 300;
  static const feedSnapshots = 10;
  static const imageMemoryEntries = 100;
  static const imageMemoryBytes = 20 * mib;
  static const imageEntryBytes = 10 * mib;
  static const imageDiskBytes = 150 * mib;
  static const decodedImageBytes = 64 * mib;
  static const highlightEntries = 64;
  static const highlightCharacters = 500000;
  static const highlightEntryCharacters = 100000;
}

/// 缓存分类与 HTTP 路径分开；容量淘汰不应该理解 API 的命名。
abstract final class CacheTags {
  static const searchResults = 'searchResults';
  static const articleBodies = 'articleBodies';
}
