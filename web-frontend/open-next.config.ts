/** @file Independent Worker cache; public data expires after 60 seconds. */
import { defineCloudflareConfig } from '@opennextjs/cloudflare'
import r2IncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache'
export default defineCloudflareConfig({ incrementalCache: r2IncrementalCache, queue: 'direct' })
