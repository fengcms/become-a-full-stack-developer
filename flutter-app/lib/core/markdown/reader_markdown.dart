import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';
import 'package:markdown/markdown.dart' as md;
import 'package:highlight/highlight.dart' as hl;

import 'code_cache.dart';

import 'package:url_launcher/url_launcher.dart';

import '../../core/generated/models.dart';
import '../../shared/widgets.dart';
import '../../features/web_page.dart';

/// ATX syntax is the only place where a server TOC item can acquire a render key.
/// Setext and fenced-code content never consume an item. No client slug algorithm.
class ServerHeadingSyntax extends md.HeaderSyntax {
  ServerHeadingSyntax(this.toc);
  final List<ApiTocItem> toc;
  int cursor = 0;
  Object? document;
  @override
  md.Node parse(md.BlockParser parser) {
    if (!identical(document, parser.document)) {
      cursor = 0;
      document = parser.document;
    }
    final raw = parser.current.content;
    final node = super.parse(parser) as md.Element;
    final match = RegExp(r'^(#{1,6})\s+(.+?)\s*#*\s*$').firstMatch(raw);
    if (match != null && cursor < toc.length) {
      final item = toc[cursor];
      if (item.level == match[1]!.length && item.text == match[2]!.trim()) {
        node.attributes['reader-anchor'] = item.anchor!;
        cursor++;
      }
    }
    return node;
  }
}

class _HeadingBuilder extends MarkdownElementBuilder {
  _HeadingBuilder(this.keys);
  final Map<String, GlobalKey> keys;
  @override
  bool isBlockElement() => true;
  @override
  Widget? visitElementAfterWithContext(
    BuildContext context,
    md.Element element,
    TextStyle? preferredStyle,
    TextStyle? parentStyle,
  ) {
    final anchor = element.attributes['reader-anchor'];
    final h2 = element.tag == 'h2';
    return Container(
      key: anchor == null ? null : keys[anchor],
      margin: EdgeInsets.only(top: h2 ? 32 : 24, bottom: 12),
      padding: EdgeInsets.only(left: h2 ? 10 : 0),
      decoration: h2
          ? BoxDecoration(
              border: Border(
                left: BorderSide(color: context.colors.brand, width: 3),
              ),
            )
          : null,
      child: Text(element.textContent, style: preferredStyle),
    );
  }
}

class _CodeBuilder extends MarkdownElementBuilder {
  _CodeBuilder(this.public);
  final bool public;
  @override
  bool isBlockElement() => true;
  @override
  Widget? visitElementAfterWithContext(
    BuildContext context,
    md.Element element,
    TextStyle? preferredStyle,
    TextStyle? parentStyle,
  ) {
    final code = element.children
        ?.whereType<md.Element>()
        .where((e) => e.tag == 'code')
        .firstOrNull;
    final source = code?.textContent ?? element.textContent;
    final language = (code?.attributes['class'] ?? '')
        .split(' ')
        .where((c) => c.startsWith('language-'))
        .map((c) => c.substring(9))
        .firstOrNull;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final palette = <String, Color>{
      'keyword': Color(dark ? 0xffc4a0f5 : 0xff8b5cf6),
      'built_in': Color(dark ? 0xffc4a0f5 : 0xff8b5cf6),
      'string': Color(dark ? 0xff6fcfb4 : 0xff0f766e),
      'comment': context.colors.textMuted,
      'number': Color(dark ? 0xffedbd83 : 0xffa65f19),
      'literal': Color(dark ? 0xffedbd83 : 0xffa65f19),
      'title': context.colors.brand,
      'attr': context.colors.brand,
    };
    TextSpan span(hl.Node n) => TextSpan(
      text: n.value,
      style: TextStyle(color: palette[n.className]),
      children: n.children?.map(span).toList(),
    );
    List<TextSpan> tokens = [TextSpan(text: source)];
    if (language != null && language.isNotEmpty) {
      try {
        tokens = CodeCache.parse(
          source,
          language,
          public: public,
        ).map(span).toList();
      } catch (_) {
        /* Unknown fences remain readable and copyable as plain text. */
      }
    }
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.symmetric(vertical: 8),
      decoration: BoxDecoration(
        color: context.colors.codeBg,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: context.colors.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.only(left: 12),
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
                      fontSize: 11,
                      color: context.colors.textMuted,
                    ),
                  ),
                ),
                IconButton(
                  tooltip: '复制代码',
                  icon: const Text('复制', style: TextStyle(fontSize: 11)),
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
          ),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.all(12),
            child: SelectableText.rich(
              TextSpan(children: tokens),
              style: TextStyle(
                fontFamily: 'monospace',
                fontSize: 14,
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

class ReaderMarkdown extends StatefulWidget {
  const ReaderMarkdown(
    this.content, {
    super.key,
    this.toc = const [],
    this.headingKeys = const {},
    this.publicImages = true,
  });
  final String content;
  final List<ApiTocItem> toc;
  final Map<String, GlobalKey> headingKeys;
  final bool publicImages;
  @override
  State<ReaderMarkdown> createState() => _ReaderMarkdownState();
}

class _ReaderMarkdownState extends State<ReaderMarkdown> {
  Widget? body;
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    Theme.of(context);
    MediaQuery.textScalerOf(context);
    body = null;
  }

  @override
  void didUpdateWidget(covariant ReaderMarkdown old) {
    super.didUpdateWidget(old);
    if (old.content != widget.content ||
        !identical(old.headingKeys, widget.headingKeys) ||
        old.publicImages != widget.publicImages) {
      body = null;
    }
  }

  @override
  Widget build(BuildContext context) => body ??= _MarkdownContent(
    widget.content,
    toc: widget.toc,
    headingKeys: widget.headingKeys,
    publicImages: widget.publicImages,
  );
}

class _MarkdownContent extends StatelessWidget {
  const _MarkdownContent(
    this.content, {
    this.toc = const [],
    this.headingKeys = const {},
    this.publicImages = true,
  });
  final String content;
  final bool publicImages;
  final List<ApiTocItem> toc;
  final Map<String, GlobalKey> headingKeys;
  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return MarkdownBody(
      key: ObjectKey(headingKeys),
      data: content,
      selectable: true,
      extensionSet: md.ExtensionSet.gitHubFlavored,
      blockSyntaxes: [ServerHeadingSyntax(toc)],
      builders: {
        for (int i = 1; i <= 6; i++) 'h$i': _HeadingBuilder(headingKeys),
        'pre': _CodeBuilder(publicImages),
      },
      styleSheet: MarkdownStyleSheet.fromTheme(Theme.of(context)).copyWith(
        p: context.text.bodyLarge,
        h1: context.text.headlineSmall,
        h2: context.text.titleLarge,
        h3: context.text.titleMedium,
        a: TextStyle(color: c.brand),
        code: TextStyle(
          color: c.codeFg,
          backgroundColor: c.codeBg,
          fontFamily: 'monospace',
        ),
        blockquoteDecoration: BoxDecoration(
          color: c.surfaceSunken,
          border: Border(left: BorderSide(color: c.brand, width: 3)),
        ),
        blockquotePadding: const EdgeInsets.all(16),
        tableColumnWidth: const IntrinsicColumnWidth(),
        tableBorder: TableBorder.all(color: c.line),
        tableCellsPadding: const EdgeInsets.all(10),
        horizontalRuleDecoration: BoxDecoration(
          border: Border(top: BorderSide(color: c.line)),
        ),
      ),
      imageBuilder: (uri, title, alt) => Semantics(
        label: alt ?? title ?? '文章图片',
        child: ReaderImage(uri.toString(), public: publicImages),
      ),
      onTapLink: (text, href, title) async {
        if (href == null) return;
        final uri = Uri.tryParse(href);
        if (uri == null || !['https', 'http', 'mailto'].contains(uri.scheme)) {
          notice(context, '此链接暂不支持打开');
          return;
        }
        if (isWebAddress(uri)) {
          await Navigator.of(context)
              .push<void>(MaterialPageRoute(builder: (_) => WebPage(url: uri)));
          return;
        }
        try {
          if (!await launchUrl(uri, mode: LaunchMode.externalApplication) &&
              context.mounted) {
            notice(context, '无法打开链接');
          }
        } catch (e) {
          if (context.mounted) notice(context, '无法打开链接');
        }
      },
    );
  }
}
