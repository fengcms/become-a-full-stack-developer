/** @file Recoverable page error boundary; preserve surrounding site navigation. */
'use client'
/** Network failures must not masquerade as missing content. */
const ErrorPage = () => (
  <div className="empty" role="alert">
    <div className="emptymark">!</div>
    <h1>内容暂时没有加载出来</h1>
    <p>服务连接遇到了一点问题，你可以稍后再试。</p>
    <button type="button" className="pbutton" onClick={() => window.location.reload()}>
      重新加载
    </button>
  </div>
)
export default ErrorPage
