part of 'search_page.dart';

/// 输入控制器由搜索页持有，提交同时支持键盘与按钮。
class _SearchHeader extends StatelessWidget {
  const _SearchHeader({required this.input, required this.search});
  final TextEditingController input;
  final VoidCallback search;
  @override
  Widget build(BuildContext context) => Padding(
    padding: AppInsets.page,
    child: Row(
      children: [
        Expanded(
          child: TextField(
            controller: input,
            textInputAction: TextInputAction.search,
            onSubmitted: (_) => search(),
            style: const TextStyle(fontSize: AppType.body),
            decoration: InputDecoration(
              hintText: '搜索文章、标签',
              contentPadding: AppInsets.control,
              prefixIconConstraints: const BoxConstraints(
                minWidth: 40,
                minHeight: 40,
              ),
              isDense: true,
              prefixIcon: const Padding(
                padding: AppInsets.compact,
                child: PrototypeIcon('search', size: 16),
              ),
              filled: true,
              fillColor: context.colors.bgSubtle,
              border: OutlineInputBorder(borderRadius: AppRadius.rFull),
              enabledBorder: OutlineInputBorder(
                borderRadius: AppRadius.rFull,
                borderSide: BorderSide(color: context.colors.fieldBorder),
              ),
            ),
          ),
        ),
        const SizedBox(width: 8),
        FilledButton(onPressed: search, child: const Text('搜索')),
      ],
    ),
  );
}
