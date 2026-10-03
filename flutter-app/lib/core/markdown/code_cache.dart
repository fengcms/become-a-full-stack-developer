import 'package:fullstack_reader/core/cache/cache_limits.dart';
import 'package:highlight/highlight.dart' as hl;

/// 仅共享公开正文的词法节点，不缓存主题颜色、组件或目录定位键。
class CodeCache {
  static final _nodes = <String, List<hl.Node>>{};
  static int _characters = 0;
  static List<hl.Node> parse(
    String source,
    String language, {
    required bool public,
  }) {
    final key = '$language\u0000$source';
    final existing = public ? _nodes.remove(key) : null;
    if (existing != null && public) {
      _nodes[key] = existing;
      return existing;
    }
    final nodes =
        hl.highlight.parse(source, language: language.toLowerCase()).nodes ??
        [];
    if (public && key.length <= CacheLimits.highlightEntryCharacters) {
      _nodes[key] = nodes;
      _characters += key.length;
      while (_nodes.length > CacheLimits.highlightEntries ||
          _characters > CacheLimits.highlightCharacters) {
        final first = _nodes.keys.first;
        _characters -= first.length;
        _nodes.remove(first);
      }
    }
    return nodes;
  }

  static void clear() {
    _nodes.clear();
    _characters = 0;
  }
}
