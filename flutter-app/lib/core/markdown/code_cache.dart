import 'package:highlight/highlight.dart' as hl;

/// Public code only. Keep grammar tokens, never theme colors or widget keys.
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
    if (public && key.length <= 100000) {
      _nodes[key] = nodes;
      _characters += key.length;
      while (_nodes.length > 64 || _characters > 500000) {
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
