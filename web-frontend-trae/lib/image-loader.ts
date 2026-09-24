/**
 * @file Cloudflare Images 自定义图片 loader
 * Workers 运行时不支持 sharp 原生模块，因此图片优化走 Cloudflare Images API。
 * @see https://developers.cloudflare.com/images/url-format/
 */

interface ImageLoaderProps {
  src: string
  width: number
  quality?: number
}

/**
 * 构造 Cloudflare Images 优化 URL。
 * 本地开发（无 CF Images 配置）时回退到原图，避免 404。
 */
const imageLoader = ({ src, width, quality }: ImageLoaderProps): string => {
  const cfImageDomain = process.env.NEXT_PUBLIC_CF_IMAGE_DOMAIN
  if (!cfImageDomain) {
    return src
  }
  const params = new URLSearchParams({
    width: String(width),
    quality: String(quality ?? 75),
    format: 'auto',
  })
  return `${cfImageDomain}/cdn-cgi/image/${params.toString()}/${src}`
}

export default imageLoader
