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
  cache, // SmartCache instance
  config: {
    methods: ['GET'], forceCache: true
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

`CrawleeCacheOptions` extends `FetchWithCacheOptions` from `@isdk/proxy`. All options from `FetchWithCacheOptions` are available, plus the following:

| Option | Type | Description |
| :--- | :--- | :--- |
| `cache` | `SmartCache` | **Required** (from `FetchWithCacheOptions`). The SmartCache instance from `@isdk/proxy`. |
| `config` | `ProxySiteConfig` | **Required** (from `FetchWithCacheOptions`). Site-level cache configuration (rules, fingerprinting, etc.). For detailed options like `methods`, `rules`, `forceCache`, see `@isdk/proxy`. |
| `fetcher` | `Function` | Optional. Custom fetcher for real network requests. Defaults to `got-scraping`. |
| `backgroundUpdate` | `boolean` | **From `FetchWithCacheOptions`**. Enable SWR (Stale-While-Revalidate). Default: `true`. |
| `refresh` | `boolean` | **From `FetchWithCacheOptions`**. **Force refresh**: Ignores existing cache and always fetches from source. Useful for bypassing bot verification. |
| `navigationOnly` | `boolean` | Only cache the main document navigation request (Browser only). When `false`, all sub-resources (scripts, stylesheets, images, XHR/Fetch, etc.) are also intercepted and processed through the cache pipeline. Default: `true`. See [Important Notes on `navigationOnly: false`](#important-notes-on-navigationonly-false) for caveats. |
| `activeCacheWrites` | `Map` | Shared map for request collapsing across crawler instances. |

## Interception Strategies

### Cheerio / JSDOM (HTTP-only)

The adapter injects a custom handler into `gotOptions.handlers`. It intercepts the request at the lowest level, preventing `got-scraping` from making a network call if a cache hit occurs.

### Playwright (Browser)

The adapter uses `page.route` (Playwright) to intercept navigation requests. It fulfills the request directly from the cache, bypassing the browser's network stack for the main document.

### Important Notes on `navigationOnly: false`

When `navigationOnly` is set to `false`, all page sub-resources (scripts, stylesheets, fonts, images, XHR/Fetch requests, etc.) are routed through the `@isdk/proxy` cache pipeline. While this enables powerful caching of API responses and static assets, there are two important technical considerations:

#### 1. `networkIdle` Wait Strategy Incompatibility

When `navigationOnly: false` is enabled, **do NOT use `page.waitForLoadState('networkidle')` or any `networkIdle`-based wait strategy**.

**Reason**: Every intercepted request goes through an async cache pipeline (cache lookup → evaluate → fulfill). During processing, each request remains in a "pending" state from the browser's perspective. Modern web pages (especially SPAs like search engines, social media, etc.) continuously fire background network requests (analytics, heartbeats, lazy-loading). With full interception enabled, the browser's network is never truly "idle" for the required 500ms window, causing the wait to hang indefinitely until timeout.

**Solution**: Use alternative wait strategies:

```typescript
// ✅ Recommended alternatives
await page.waitForLoadState('domcontentloaded');
await page.waitForSelector('.target-element');
await page.waitForFunction(() => window.dataLoaded === true);

// ❌ Will hang with navigationOnly: false on dynamic pages
await page.waitForLoadState('networkidle');
```

#### 2. POST Request `route.fetch()` Recursion

Playwright's `route.fetch()` may re-trigger the same `page.route('**/*')` interceptor when handling POST requests, creating a recursive loop. This adapter includes a built-in defense mechanism that uses the `cacheKey` (a precise hash of method + URL + body computed by `@isdk/proxy`) to track in-flight fetches and automatically breaks the recursion by falling back to a direct Node.js HTTP request (`defaultFetcher`). This mechanism is transparent and requires no user configuration.

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
