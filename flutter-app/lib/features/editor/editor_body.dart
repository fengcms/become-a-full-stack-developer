part of '../editor.dart';

/// 编辑页面只组合表单、预览和操作条，各状态保持同一生命周期。
class _EditorBody extends StatelessWidget {
  const _EditorBody({
    required this.modes,
    required this.progress,
    required this.uploadFailed,
    required this.busy,
    required this.retryUpload,
    required this.preview,
    required this.previewBody,
    required this.form,
    required this.saveBar,
  });
  final Widget modes;
  final double? progress;
  final bool uploadFailed;
  final bool busy;
  final VoidCallback retryUpload;
  final bool preview;
  final Widget previewBody;
  final Widget form;
  final Widget saveBar;
  @override
  Widget build(BuildContext context) => SafeArea(
    child: Column(
      children: [
        Container(
          padding: AppInsets.toolbar,
          decoration: BoxDecoration(
            border: Border(bottom: BorderSide(color: context.colors.line)),
          ),
          child: modes,
        ),
        if (progress != null) LinearProgressIndicator(value: progress),
        if (uploadFailed)
          ListTile(
            title: const Text('图片上传失败，正文已保留'),
            trailing: TextButton(
              onPressed: busy ? null : retryUpload,
              child: const Text('重试'),
            ),
          ),
        Expanded(
          child: SingleChildScrollView(
            padding: AppInsets.page,
            child: AbsorbPointer(
              absorbing: busy,
              child: preview ? previewBody : form,
            ),
          ),
        ),
        saveBar,
      ],
    ),
  );
}
