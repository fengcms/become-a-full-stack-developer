part of 'notifications_page.dart';

/// 加载、错误、空态和继续翻页的条件沿用页面状态，刷新时保留已有通知。
class _NotificationStatus extends StatelessWidget {
  const _NotificationStatus({
    required this.error,
    required this.busy,
    required this.more,
    required this.empty,
    required this.load,
  });
  final Object? error;
  final bool busy;
  final bool more;
  final bool empty;
  final VoidCallback load;
  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        if (error != null) StateMessage(error: error, onRetry: load),
        if (busy) const Center(child: CircularProgressIndicator()),
        if (!busy && more)
          TextButton(onPressed: load, child: const Text('加载更多')),
        if (!busy && empty && error == null)
          const StateMessage(
            title: '没有新通知',
            description: '文章发布、评论通过时，会在这里通知你。',
          ),
      ],
    );
  }
}
