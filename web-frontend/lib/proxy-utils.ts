/** @file Isolate this frontend's cookie from the original frontend on the same hostname. */
export const COOKIE_NAME = 'codex_refresh'
/** Forward only this application's refresh cookie to the backend. */
export const backendCookie = (cookies: string): string => {
  const token = cookies
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${COOKIE_NAME}=`))
    ?.slice(COOKIE_NAME.length + 1)
  return token ? `refreshToken=${token}` : ''
}
/** Same-origin browser sessions use Lax; Secure is relaxed only on literal loopback hosts. */
export const frontendCookie = (cookie: string, hostname: string): string => {
  let result = cookie
    .replace(/^refreshToken=/, `${COOKIE_NAME}=`)
    .replace(/;\s*SameSite=[^;]+/i, '; SameSite=Lax')
  if (['localhost', '127.0.0.1', '[::1]'].includes(hostname))
    result = result.replace(/;\s*Secure/gi, '')
  return result
}
