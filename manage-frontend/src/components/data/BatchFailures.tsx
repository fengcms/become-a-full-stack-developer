/**
 * @file components/data/BatchFailures.tsx
 * @description 持久展示批量失败明细，避免仅靠短暂通知丢失处理线索。
 */
/** 将失败记录放在可展开的列表中。 */
export const BatchFailures = ({ messages }: { messages: string[] }) =>
  messages.length ? (
    <details open className="my-3 rounded-md border border-destructive/30 p-3 text-sm">
      <summary>有 {messages.length} 项未完成，已保留选中，可重试</summary>
      <ul className="mt-2 space-y-1">
        {messages.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
    </details>
  ) : null
