part of '../editor.dart';

/// 提交字段只从当前表单生成；创建时设置状态，编辑时由后端保持审核规则。
Map<String, dynamic> editorPayload({
  required String title,
  required String summary,
  required String content,
  required int? category,
  required String cover,
  required String tags,
  required bool isNew,
  required bool submit,
}) {
  return <String, dynamic>{
    'title': title.trim(),
    'summary': summary.trim(),
    'content': content,
    'categoryId': category,
    'coverImage': cover.isEmpty ? null : cover,
    'tags': tags
        .split(RegExp('[,，]'))
        .map((s) => s.trim())
        .where((s) => s.isNotEmpty)
        .toSet()
        .toList(),
    if (isNew) 'status': submit ? 'pending' : 'draft',
  };
}

/// 工具栏围绕当前选区插入标记，无选区时追加；游标停在结束标记之前。
List<ApiCategoryNode> flattenCategories(List<ApiCategoryNode> nodes) => [
  for (final n in nodes) ...[n, ...flattenCategories(n.children)],
];
void wrapSelection(TextEditingController content, String before, String after) {
  final s = content.selection;
  final start = s.isValid ? s.start : content.text.length,
      end = s.isValid ? s.end : content.text.length;
  final selected = content.text.substring(start, end);
  content.value = TextEditingValue(
    text: content.text.replaceRange(start, end, '$before$selected$after'),
    selection: TextSelection.collapsed(
      offset: start + before.length + selected.length,
    ),
  );
}
