part of 'reader_markdown.dart';

/// 代码语言、复制按钮与横向滚动正文组成独立区块，未知语言退回纯文本。
class _CodeBlock extends StatelessWidget {
  const _CodeBlock({
    required this.source,
    required this.language,
    required this.public,
  });
  final String source;
  final String? language;
  final bool public;
  @override
  Widget build(BuildContext context) {
    final palette = AppSyntax.palette(
      Theme.of(context).brightness,
      context.colors,
    );
    TextSpan span(hl.Node n) => TextSpan(
      text: n.value,
      style: TextStyle(color: palette[n.className]),
      children: n.children?.map(span).toList(),
    );
    List<TextSpan> tokens = [TextSpan(text: source)];
    if (language != null && language!.isNotEmpty) {
      try {
        tokens = CodeCache.parse(
          source,
          language!,
          public: public,
        ).map(span).toList();
      } catch (_) {
        /* Unknown fences remain readable and copyable as plain text. */
      }
    }
    return Container(
      width: double.infinity,
      margin: AppInsets.codeBlock,
      decoration: BoxDecoration(
        color: context.colors.codeBg,
        borderRadius: AppRadius.rMd,
        border: Border.all(color: context.colors.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _CodeHeader(source: source, language: language),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: AppInsets.compact,
            child: SelectableText.rich(
              TextSpan(children: tokens),
              style: TextStyle(
                fontFamily: 'monospace',
                fontSize: AppType.label,
                height: 1.7,
                color: context.colors.codeFg,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// 复制使用原始源码，避免高亮节点重组造成空白或转义字符丢失。
class _CodeHeader extends StatelessWidget {
  const _CodeHeader({required this.source, required this.language});
  final String source;
  final String? language;
  @override
  Widget build(BuildContext context) => Container(
    padding: AppInsets.codeLabel,
    decoration: BoxDecoration(
      border: Border(bottom: BorderSide(color: context.colors.line)),
    ),
    child: Row(
      children: [
        Expanded(
          child: Text(
            language?.isNotEmpty == true ? language! : '纯文本',
            style: TextStyle(
              fontFamily: 'monospace',
              fontSize: AppType.micro,
              color: context.colors.textMuted,
            ),
          ),
        ),
        IconButton(
          tooltip: '复制代码',
          icon: const Text('复制', style: TextStyle(fontSize: AppType.micro)),
          onPressed: () async {
            try {
              await Clipboard.setData(ClipboardData(text: source));
              if (context.mounted) notice(context, '代码已复制');
            } catch (e) {
              if (context.mounted) notice(context, '复制失败，请手动选择');
            }
          },
        ),
      ],
    ),
  );
}
