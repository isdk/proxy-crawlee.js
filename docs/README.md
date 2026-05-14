**@isdk/proxy-crawlee**

***

# @isdk/proxy-crawlee

A caching adapter for [Crawlee](https://crawlee.dev/) that integrates the `@isdk/proxy` caching engine into your web scraping workflows.

## Features

- **🚀 Universal Hook**: Use a single `preNavigationHooks` for both `CheerioCrawler` and `PlaywrightCrawler`.
- **🧠 Environment-Aware**: Automatically detects the crawler engine and applies the most efficient interception strategy.
- **🛡️ Request Collapsing**: Prevents cache stampede in high-concurrency scraping sessions.
- **🌊 Native Streaming**: Efficiently caches large documents without high memory overhead.
- **🔄 SWR Support**: Background revalidation ensures your crawler always gets data instantly while keeping the cache fresh.
- **🔌 Flexible Fetcher**: Built-in `got-scraping` support for fingerprinting, but fully customizable.

## Installation

```bash
pnpm add @isdk/proxy-crawlee @isdk/proxy
```

Note: This adapter requires `crawlee` (and optionally `got-scraping`) to be installed in your project.

## Quick Start

```typescript
import { SmartCache } from '@isdk/proxy';
import { createCrawleeCacheHook } from '@isdk/proxy-crawlee';
import { CheerioCrawler } from 'crawlee';

// 1. Initialize the cache
const cache = new SmartCache({ storagePath: './.cache' });

// 2. Create the hook
const cacheHook = createCrawleeCacheHook({
  cache,
  config: {
    default: { methods: ['GET'], forceCache: true }
  }
});

// 3. Apply to any crawler
const crawler = new CheerioCrawler({
  preNavigationHooks: [ cacheHook ],
  requestHandler: async ({ request, body }) => {
    console.log(`Fetched ${request.url} (Cache: ${request.headers['x-proxy-cache']})`);
  },
});

await crawler.run(['https://example.com']);
```

## Configuration Options

| Option | Type | Description |
| :--- | :--- | :--- |
| `cache` | `SmartCache` | **Required**. The SmartCache instance from `@isdk/proxy`. |
| `config` | `ProxySiteConfig` | **Required**. Cache rules and fingerprinting settings from `@isdk/proxy`. |
| `fetcher` | `Function` | Optional. Custom fetcher for real network requests. Defaults to `got-scraping`. |
| `backgroundUpdate` | `boolean` | Enable SWR (Stale-While-Revalidate). Default: `true`. |
| `navigationOnly` | `boolean` | Only cache the main document (Browser only). Default: `true`. |
| `activeCacheWrites` | `Map` | Shared map for request collapsing across crawler instances. |

## Interception Strategies

### Cheerio / JSDOM (HTTP-only)

The adapter injects a custom handler into `gotOptions.handlers`. It intercepts the request at the lowest level, preventing `got-scraping` from making a network call if a cache hit occurs.

### Playwright (Browser)

The adapter uses `page.route` (Playwright) to intercept navigation requests. It fulfills the request directly from the cache, bypassing the browser's network stack for the main document.

## Offline Mode

**Offline Mode**: Disables network access and only uses the local cache. When a cache miss occurs, the crawler will throw `OfflineCacheMissError`.

For this error to properly fail your crawler, you must configure `throwHttpErrors: true` in your Crawlee options:

```typescript
const crawler = new CheerioCrawler({
  preNavigationHooks: [ cacheHook ],
  requestHandler: async ({ request, body }) => {
    console.log(`Fetched ${request.url}`);
  },
  throwHttpErrors: true, // Required for OfflineCacheMissError
});
```

## License

MIT
