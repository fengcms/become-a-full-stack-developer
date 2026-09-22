/** Resolve application aliases for Node's native TypeScript test runner. */
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
export const resolve = async (specifier, context, nextResolve) => {
  if (specifier.startsWith('@/')) {
    const base = new URL(`../${specifier.slice(2)}`, import.meta.url)
    for (const suffix of ['.ts', '/index.ts']) {
      const url = new URL(base.href + suffix)
      if (existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true }
    }
  }
  return nextResolve(specifier, context)
}
