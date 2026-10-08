export const fileUrl = (url?: string | null) => {
  if (!url) return ''
  if (/^(https?:)?\/\//.test(url)) return url
  return url.startsWith('/') ? url : `/${url}`
}
