import 'package:fullstack_reader/app/theme/app_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';
import 'package:markdown/markdown.dart' as md;
import 'package:highlight/highlight.dart' as hl;

import 'code_cache.dart';

import 'package:url_launcher/url_launcher.dart';

import '../../core/generated/models.dart';

import 'package:fullstack_reader/shared/widgets/notice.dart';
import 'package:fullstack_reader/shared/widgets/reader_context.dart';
import 'package:fullstack_reader/shared/widgets/reader_image.dart';

import '../../features/web_page.dart';

part 'code_block.dart';

/// 仅 ATX 标题消耗服务端目录项；代码围栏和 Setext 标题不冒充目录锚点。
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
      margin: EdgeInsets.only(
        top: h2 ? AppSpacing.s8 : AppSpacing.s6,
        bottom: AppSpacing.s3,
      ),
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
    return _CodeBlock(source: source, language: language, public: public);
  }
}

/// 正文渲染依赖内容、目录定位键与主题，私有预览禁用公开图片和词法缓存。
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
        blockquotePadding: AppInsets.page,
        tableColumnWidth: const IntrinsicColumnWidth(),
        tableBorder: TableBorder.all(color: c.line),
        tableCellsPadding: AppInsets.codeInline,
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
