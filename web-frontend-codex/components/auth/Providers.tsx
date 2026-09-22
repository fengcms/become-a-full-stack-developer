/** @file Client boundaries: query cache and one-time session restoration. */
'use client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { bootstrapSession, setUnauthorizedHandler } from '@/lib/request'
import { useAuthStore } from '@/store/auth'
/** Restore authentication once; clear private queries when identities change. */
export const Providers = ({ children }: { children: React.ReactNode }) => {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30000 } },
      }),
  )
  useEffect(() => {
    setUnauthorizedHandler(() => {
      client.clear()
      window.location.assign(
        `/login?expired=1&redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`,
      )
    })
    void bootstrapSession().finally(() => useAuthStore.getState().setBootStatus('ready'))
    const unsub = useAuthStore.subscribe((next, prev) => {
      if (next.user?.id !== prev.user?.id)
        client.removeQueries({ predicate: (query) => query.queryKey[0] !== 'public-feed' })
    })
    return () => {
      unsub()
      setUnauthorizedHandler(null)
    }
  }, [client])
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
