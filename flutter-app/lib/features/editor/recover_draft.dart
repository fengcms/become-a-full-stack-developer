part of '../editor.dart';

/// 损坏的本机草稿只清除对应键；恢复前说明不会立即改动服务器稿件。
Future<Map<String, dynamic>?> recoverDraft(
  SharedPreferences prefs,
  String key,
  BuildContext context,
) async {
  final cached = prefs.getString(key);
  if (cached == null || !context.mounted) return null;
  Map<String, dynamic> recovery;
  try {
    recovery = jsonMap(jsonDecode(cached));
  } catch (_) {
    await prefs.remove(key);
    return null;
  }
  if (!context.mounted) return null;
  final accepted = await confirm(
    context,
    '恢复本机草稿',
    '发现上次未保存的内容，是否恢复？服务器稿件不会立即被修改。',
  );
  return accepted && context.mounted ? recovery : null;
}
