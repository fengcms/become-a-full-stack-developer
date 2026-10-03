part of '../editor.dart';

/// 编辑器框架统一处理首次加载和导航，正文表单始终由页面持有。
class _EditorScaffold extends StatelessWidget {
  const _EditorScaffold({
    required this.id,
    required this.leave,
    required this.metadata,
    required this.loaded,
    required this.error,
    required this.load,
    required this.body,
  });
  final int? id;
  final VoidCallback leave;
  final VoidCallback metadata;
  final bool loaded;
  final Object? error;
  final VoidCallback load;
  final Widget body;
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      leading: IconButton(
        tooltip: '返回',
        onPressed: leave,
        icon: const ReaderIcon(Icons.arrow_back),
      ),
      title: Text(id == null ? '写文章' : '编辑稿件'),
      actions: [
        IconButton(
          tooltip: '发布信息',
          onPressed: metadata,
          icon: const PrototypeIcon('more'),
        ),
      ],
    ),
    body: !loaded
        ? (error == null
              ? const Center(child: CircularProgressIndicator())
              : StateMessage(error: error, onRetry: load))
        : body,
  );
}
