# @isdk/proxy-crawlee

为 [Crawlee](https://crawlee.dev/) 打造的缓存适配器，将 `@isdk/proxy` 高性能缓存引擎无缝集成到爬虫工作流中，大幅提升抓取效率并减少对源站的压力。

## 核心特性

- **🚀 通用 Hook 设计**：只需一个 `preNavigationHooks` 即可同时适配 `CheerioCrawler`、`PlaywrightCrawler` 和 `PuppeteerCrawler`。
- **🧠 环境自适应**：自动识别当前的爬虫引擎（浏览器或 HTTP），并应用最有效的拦截策略。
- **🛡️ 请求合并 (Request Collapsing)**：在高并发抓取场景下，确保针对同一 URL 的重复请求只会被执行一次，彻底防止缓存击穿。
- **🌊 原生流式缓存**：支持大数据量响应的流式写入磁盘，避免大 HTML 文档导致的内存溢出 (OOM)。
- **🔄 后台更新 (SWR)**：支持过期数据立即返回并在后台异步更新，让爬虫始终保持"零等待"。
- **🔌 灵活的 Fetcher**：内置对 `got-scraping` 的指纹模拟支持，同时也允许用户完全自定义请求引擎。

## 安装

```bash
pnpm add @isdk/proxy-crawlee @isdk/proxy
```

> [!NOTE]
> 本适配器运行时需要 `crawlee`（如需指纹模拟，建议同时安装 `got-scraping`）。

## 快速开始

```typescript
import { SmartCache } from '@isdk/proxy';
import { createCrawleeCacheHook } from '@isdk/proxy-crawlee';
import { CheerioCrawler } from 'crawlee';

// 1. 初始化 SmartCache 实例
const cache = new SmartCache({
  storagePath: './.cache',
  maxMemorySize: 1024 * 1024 // 1MB 以上的文件转储磁盘
});

// 2. 创建缓存 Hook
const cacheHook = createCrawleeCacheHook({
  cache,
  config: {
    // 默认对所有 GET 请求开启强制缓存
    default: { methods: ['GET'], forceCache: true }
  }
});

// 3. 将 Hook 添加到 Crawlee 配置中
const crawler = new CheerioCrawler({
  preNavigationHooks: [ cacheHook ],
  requestHandler: async ({ request, body, response }) => {
    const cacheStatus = response.headers['x-proxy-cache'];
    console.log(`URL: ${request.url} | 缓存状态: ${cacheStatus}`);
  },
});

await crawler.run(['https://example.com']);
```

## 配置项详解 (CrawleeCacheOptions)

| 参数 | 类型 | 说明 |
| :--- | :--- | :--- |
| `cache` | `SmartCache` | **必填**。来自 `@isdk/proxy` 的 SmartCache 实例。 |
| `config` | `SiteCacheConfig` | **必填**。来自 `@isdk/proxy` 的缓存策略配置（如 `methods`, `cacheRules`, `forceCache` 等）。 |
| `fetcher` | `Function` | 可选。自定义真实网络请求函数。默认为内置的 `got-scraping` 封装。 |
| `backgroundUpdate` | `boolean` | 是否启用 SWR 后台异步更新。默认：`true`。 |
| `navigationOnly` | `boolean` | 是否仅缓存主文档导航请求（仅对浏览器引擎生效）。默认：`true`。 |
| `activeCacheWrites` | `Map` | 可选。用于跨 Crawler 实例共享并发写入状态，防止重复下载。 |

## 拦截策略详解

### Cheerio / JSDOM (HTTP 引擎)

适配器会向 `gotOptions.handlers` 注入一个拦截处理器。它在 Got 请求生命周期的最底层进行干预，如果缓存命中，将直接返回模拟的响应对象，从而完全跳过网络 I/O。

### Playwright / Puppeteer (浏览器引擎)

适配器利用 `page.route` (Playwright) 或 `setRequestInterception` (Puppeteer) 拦截请求。通过将主文档请求重定向到 `fetchWithCache` 逻辑中，实现从缓存直接 `fulfill` 页面内容，绕过浏览器的网络栈。

## 许可证

MIT
