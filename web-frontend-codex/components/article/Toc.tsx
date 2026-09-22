/** @file Active article outline, using IDs emitted by the Markdown tree transformer. */
'use client'
import { useEffect, useState } from 'react'
import type { Heading } from '@/lib/headings'
/** Highlight headings as they enter the reading viewport. */
export const Toc = ({ headings }: { headings: Heading[] }) => {
  const [active, setActive] = useState(headings[0]?.id)
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id)
      },
      { rootMargin: '-10% 0px -65% 0px' },
    )
    headings.forEach((h) => {
      const node = document.getElementById(h.id)
      if (node) observer.observe(node)
    })
    return () => observer.disconnect()
  }, [headings])
  return (
    <nav className="toc" aria-label="本文目录">
      {headings.map((h) => (
        <a
          key={h.id}
          href={`#${encodeURIComponent(h.id)}`}
          className={`${h.id === active ? 'active' : ''} ${h.level > 2 ? 'indent' : ''}`}
          aria-current={h.id === active ? 'location' : undefined}
        >
          {h.text}
        </a>
      ))}
    </nav>
  )
}
