/** @file Copyable code blocks retain plain text and preserve server-rendered highlighting. */
'use client'
import { useRef, useState } from 'react'
/** Clipboard success is reported only after the browser confirms it. */
export const CodeBlock = ({ children }: { children?: React.ReactNode }) => {
  const pre = useRef<HTMLPreElement>(null)
  const [message, setMessage] = useState('复制')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(pre.current?.textContent || '')
      setMessage('已复制')
    } catch {
      setMessage('复制失败，请手动选择')
    }
  }
  return (
    <div className="codebox">
      <div className="codetop">
        <span>代码</span>
        <button className="textbutton" type="button" onClick={copy}>
          {message}
        </button>
      </div>
      <pre ref={pre}>{children}</pre>
    </div>
  )
}
