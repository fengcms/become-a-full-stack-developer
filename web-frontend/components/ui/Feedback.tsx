/** @file Reusable empty, failure, and loading treatments. */
import Link from 'next/link'
/** An explicit state with a meaningful recovery action. */
export const Empty = ({
  title = '暂无文章',
  message = '这里还没有内容，先看看其他文章吧。',
  href = '/articles',
  action = '浏览文章',
}: {
  title?: string
  message?: string
  href?: string
  action?: string
}) => (
  <div className="empty">
    <div className="emptymark" aria-hidden="true">
      F
    </div>
    <h2>{title}</h2>
    <p>{message}</p>
    <Link className="pbutton" href={href}>
      {action}
    </Link>
  </div>
)
/** Layout-preserving loading state with accessible text. */
export const Skeleton = () => (
  <div role="status" aria-busy="true" aria-label="正在加载">
    <span className="sr-only">正在加载内容</span>
    {[1, 2, 3].map((i) => (
      <div className="entry" key={i}>
        <div className="skeleton thumbsk" />
        <div className="entrybody">
          <div className="skeleton tall" />
          <div className="skeleton" />
          <div className="skeleton short" />
        </div>
      </div>
    ))}
  </div>
)
/** Inline recoverable errors preserve the surrounding content. */
export const Failure = ({
  retry,
  message = '暂时无法加载，请稍后重试。',
}: {
  retry: () => void
  message?: string
}) => (
  <div className="hint" role="alert">
    <p>{message}</p>
    <button className="sbutton" type="button" onClick={retry}>
      重新加载
    </button>
  </div>
)
