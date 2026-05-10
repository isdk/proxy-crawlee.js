import { debug as debugFactory } from 'debug';
import { createFetchWithCache } from '@isdk/proxy';
import { CrawleeCacheOptions, CrawleeContext } from './types';
import { crawleeToWebRequest } from './crawleeToWebRequest';
import { webResponseToFulfill } from './webResponseToFulfill';
import { defaultFetcher } from './defaultFetcher';
import { setupHttpCrawlerCache } from './setupHttpCrawlerCache';

const debug = debugFactory('@isdk/proxy:adapters:crawlee');

const INTERCEPTED_PAGES = new WeakSet<any>();

/**
 * 创建一个通用的 Crawlee 缓存钩子，可用于 preNavigationHooks。
 *
 * 该钩子实现了“环境自适应”：
 * 1. 如果检测到 Playwright 环境，会自动设置请求路由拦截。
 * 2. 如果检测到 HTTP 环境 (CheerioCrawler)，会自动调用 setupHttpCrawlerCache。
 */
export function createCrawleeCacheHook(options: CrawleeCacheOptions) {
  const {
    cache,
    config,
    backgroundUpdate = true,
    navigationOnly = true,
    activeCacheWrites = new Map<string, Promise<void>>()
  } = options;

  // 创建一个绑定的 fetchWithCache 实例，共享并发写入追踪
  const fetchWithCacheBound = createFetchWithCache(activeCacheWrites);

  return async (context: CrawleeContext, secondArg?: any) => {
    const { page, crawler } = context;

    if (page) {
      // --- 场景 A: 浏览器引擎 (Playwright) ---
      // 确保每个页面只设置一次拦截，避免重复注册导致的内存泄漏和逻辑混乱
      if (INTERCEPTED_PAGES.has(page)) {
        return;
      }
      INTERCEPTED_PAGES.add(page);

      debug('Setting up browser cache interception for page');

      const interceptor = async (route: any) => {
        try {
          const req = route.request();
          const url = req.url();

          const isNavigation = req.isNavigationRequest();

          if (navigationOnly && !isNavigation) {
            debug('Skipping non-navigation request: %s', url);
            return route.continue();
          }

          debug('Intercepting request: %s', url);

          const webReq = crawleeToWebRequest(req);
          const response = await fetchWithCacheBound(
            webReq,
            async (innerReq) => {
              if (options.fetcher) return options.fetcher(innerReq);

              // 如果是 Playwright 环境，优先使用 route.fetch() 以前往真实网络抓取内容
              // 这样可以复用浏览器的上下文（Cookie、会话等）
              if (typeof route.fetch === 'function') {
                try {
                  debug('Using Playwright route.fetch() for: %s', innerReq.url);
                  const playwrightRes = await route.fetch();
                  const headers = playwrightRes.headers();
                  // 移除一些可能导致冲突的 hop-by-hop 头部（可选，但通常 Playwright 会处理）

                  return new Response(await playwrightRes.body(), {
                    status: playwrightRes.status(),
                    statusText: playwrightRes.statusText(),
                    headers: headers,
                  });
                } catch (e) {
                  debug('Playwright route.fetch() failed, falling back to default fetcher: %o', e);
                }
              }

              return defaultFetcher(innerReq);
            },
            { cache, config, backgroundUpdate }
          );

          const fulfillOptions = await webResponseToFulfill(response);
          return route.fulfill(fulfillOptions);
        } catch (error) {
          debug('Cache interception failed for browser, continuing: %o', error);
          try {
            return route.continue();
          } catch (e) {
            debug('Failed to call route.continue: %o', e);
          }
        }
      };

      if (typeof page.route === 'function') {
        // Playwright: 使用通配符拦截所有请求，过滤逻辑在 interceptor 内部
        await page.route('**/*', interceptor);
      }

    } else if (crawler && !(crawler as any)._proxyWrapped) {
      // --- 场景 B: HTTP 引擎 (CheerioCrawler/JSDOMCrawler) ---
      setupHttpCrawlerCache(crawler, options);
    }
  };
}
