import type { FetchWithCacheOptions } from '@isdk/proxy';

/**
 * Crawlee 缓存适配器配置选项
 */
export interface CrawleeCacheOptions extends FetchWithCacheOptions {
  /**
   * 自定义 Fetcher。
   * 如果不提供，且在 HTTP 环境下，将默认尝试使用 `got-scraping`。
   */
  fetcher?: (request: Request) => Promise<Response>;
  /**
   * 是否只缓存主文档请求 (Navigation Requests)。
   * 仅对 Playwright 引擎生效。默认：true。
   */
  navigationOnly?: boolean;
}

/**
 * 内部使用的影子类型，避免直接依赖 Crawlee 核心包
 */
export interface CrawleeContext {
  request: any;
  crawler?: any;
  log?: any;
  // BrowserCrawler 特有
  page?: any;
  browserContext?: any;
  // CheerioCrawler 特有
  gotOptions?: any;
  sendRequest: any;
}
