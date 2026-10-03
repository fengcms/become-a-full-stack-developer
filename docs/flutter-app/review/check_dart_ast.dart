// 独立于评审词法探针的 AST 长度核对；使用 Flutter SDK 自带 analyzer 包环境。
// cd flutter-app
// dart --packages="$FLUTTER_ROOT/packages/flutter_tools/.dart_tool/package_config.json" \
//   ../docs/flutter-app/review/check_dart_ast.dart lib
import 'dart:convert';
import 'dart:io';

import 'package:analyzer/dart/analysis/utilities.dart';
import 'package:analyzer/dart/ast/ast.dart';
import 'package:analyzer/dart/ast/visitor.dart';

class Functions extends RecursiveAstVisitor<void> {
  Functions(this.path, this.line);
  final String path;
  final int Function(int) line;
  final entries = <Map<String, Object>>[];
  void record(AstNode node, String name) {
    final start = line(node.offset), end = line(node.end - 1);
    entries.add({
      'file': path,
      'name': name,
      'start': start,
      'end': end,
      'lines': end - start + 1,
    });
  }

  @override
  void visitConstructorDeclaration(ConstructorDeclaration node) {
    record(node, node.name?.lexeme ?? '<constructor>');
    super.visitConstructorDeclaration(node);
  }

  @override
  void visitMethodDeclaration(MethodDeclaration node) {
    record(node, node.name.lexeme);
    super.visitMethodDeclaration(node);
  }

  @override
  void visitFunctionDeclaration(FunctionDeclaration node) {
    record(node, node.name.lexeme);
    super.visitFunctionDeclaration(node);
  }

  @override
  void visitFunctionExpression(FunctionExpression node) {
    if (node.parent is! FunctionDeclaration) record(node, '<closure>');
    super.visitFunctionExpression(node);
  }
}

List<Map<String, Object>> inspect(String path, String source) {
  final result = parseString(
    content: source,
    path: path,
    throwIfDiagnostics: true,
  );
  final visitor = Functions(
    path,
    (offset) => result.lineInfo.getLocation(offset).lineNumber,
  );
  result.unit.accept(visitor);
  return visitor.entries;
}

void main(List<String> args) {
  if (args.contains('--selftest')) {
    final padding = List.filled(81, '    print(1);').join('\n');
    final rows = inspect('fixture.dart', '''
({int value}) named({int input = 1}) {
$padding
return (value: input);
}
Object arrow({int input = 1}) => (() {
$padding
return input;
})();
''');
    for (final name in ['named', 'arrow', '<closure>']) {
      if (!rows.any((e) => e['name'] == name && (e['lines'] as int) > 80)) {
        throw StateError('未检出 $name');
      }
    }
    print('AST selftest PASS: named parameters, record return, arrow lambda');
    return;
  }
  final entries = <Map<String, Object>>[];
  final files =
      Directory(args.isEmpty ? 'lib' : args.single)
          .listSync(recursive: true)
          .whereType<File>()
          .where(
            (f) => f.path.endsWith('.dart') && !f.path.contains('/generated/'),
          )
          .toList()
        ..sort((a, b) => a.path.compareTo(b.path));
  for (final f in files) {
    entries.addAll(inspect(f.path, f.readAsStringSync()));
  }
  entries.sort((a, b) => (b['lines'] as int).compareTo(a['lines'] as int));
  final over = entries.where((e) => (e['lines'] as int) > 80).toList();
  final violations = over
      .where((e) => !(e['file'] as String).contains('/app/theme/'))
      .toList();
  print(
    const JsonEncoder.withIndent('  ').convert({
      'scope': 'constructors, methods, named functions and closures; full declaration incl metadata; generated excluded',
      'files': files.length,
      'functions': entries.length,
      'violations': violations,
      'themeExemptions': over.where((e) => !violations.contains(e)).toList(),
      'functionsByLength': entries,
    }),
  );
  if (violations.isNotEmpty) exitCode = 1;
}
