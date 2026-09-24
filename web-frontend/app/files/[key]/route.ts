/** Same-origin file delivery for backend attachment URLs; no arbitrary upstream URLs. */
export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  if (!/^[a-f0-9]{64}\.(png|jpe?g|gif|webp|svg|pdf)$/i.test(key))
    return new Response('Not found', { status: 404 })
  if (!process.env.API_ORIGIN) return new Response('Unavailable', { status: 503 })
  try {
    const upstream = await fetch(new URL(`/files/${key}`, process.env.API_ORIGIN), {
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
    })
    if (!upstream.ok)
      return new Response('File unavailable', {
        status: upstream.status >= 300 && upstream.status < 400 ? 502 : upstream.status,
      })
    return new Response(upstream.body, {
      headers: {
        'content-type': upstream.headers.get('content-type') || 'application/octet-stream',
        'x-content-type-options': 'nosniff',
        'content-disposition': upstream.headers.get('content-disposition') || 'inline',
        'content-security-policy': "default-src 'none'; sandbox",
        'cache-control': 'public, max-age=3600',
      },
    })
  } catch (error) {
    console.error(
      'Attachment proxy failed:',
      error instanceof Error ? error.message : 'Unknown error',
    )
    return new Response('Unavailable', { status: 502 })
  }
}
