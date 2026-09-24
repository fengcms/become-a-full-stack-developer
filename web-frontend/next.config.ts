/** @file Independent Next.js configuration; preserve the established Node/OpenNext runtime. */
import type { NextConfig } from 'next'

const config: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  agentRules: false,
  devIndicators: false,
}
export default config
