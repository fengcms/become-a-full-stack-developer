/** @file Remote content images with stable dimensions and graceful fallback. */
'use client'
import Image from 'next/image'
import { useState } from 'react'
import { safeLink } from '@/lib/utils'
/** An invalid or broken cover never breaks the layout. */
export const Picture = ({
  src,
  alt,
  hero = false,
  mobileSrc,
}: {
  src?: string | null
  alt: string
  hero?: boolean
  mobileSrc?: string
}) => {
  const [failed, setFailed] = useState(false)
  const safe = safeLink(src)
  if (!safe || failed)
    return (
      <div className={hero ? 'cover-fallback' : 'thumb'} aria-hidden="true">
        <span>FULL STACK</span>
        <small>从实践中学习</small>
      </div>
    )
  const img = (
    <Image
      unoptimized
      src={safe}
      alt={alt}
      width={hero ? 800 : 224}
      height={hero ? 400 : 168}
      className={hero ? 'hero-image' : 'article-image'}
      onError={() => setFailed(true)}
      loading={hero ? 'eager' : 'lazy'}
    />
  )
  return safeLink(mobileSrc) ? (
    <picture>
      <source media="(max-width: 640px)" srcSet={safeLink(mobileSrc) || undefined} />
      {img}
    </picture>
  ) : (
    img
  )
}
