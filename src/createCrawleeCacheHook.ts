import { debug as debugFactory } from 'debug';
import { createFetchWithCache } from '@isdk/proxy';
import { CrawleeCacheOptions, CrawleeContext } from './types';
import { crawleeToWebRequest } from './crawleeToWebRequest';
import { webResponseToFulfill } from './webResponseToFulfill';
import { defaultFetcher } from './defaultFetcher';
import { setupHttpCrawlerCache } from './setupHttpCrawlerCache';

const debug = debugFactory('@isdk/proxy:adapters:crawlee');

/**
 * 创建一个通用的 Crawlee 缓存钩子，可用于 preNavigationHooks。
 *
 * 该钩子实现了“环境自适应”：
 * 1. 如果检测到浏览器环境 (Playwright/Puppeteer)，会自动设置请求路由拦截。
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
    const { request: crawleeReq, page, crawler } = context;

    if (page) {
      // --- 场景 A: 浏览器引擎 (Playwright/Puppeteer) ---
      debug('Setting up browser cache interception for: %s', crawleeReq.url);

      const interceptor = async (route: any) => {
        try {
          const req = typeof route.request === 'function' ? route.request() : route;

          const isNavigation = typeof req.isNavigationRequest === 'function'
            ? req.isNavigationRequest()
            : (req.resourceType() === 'document' || req.isNavigationRequest());

          if (navigationOnly && !isNavigation) {
            return typeof route.continue === 'function' ? route.continue() : undefined;
          }

          const webReq = crawleeToWebRequest(crawleeReq);
          const response = await fetchWithCacheBound(
            webReq,
            async (innerReq) => {
              const result = options.fetcher ? await options.fetcher(innerReq) : await defaultFetcher(innerReq);
              return result;
            },
            { cache, config, backgroundUpdate }
          );

          const fulfillOptions = await webResponseToFulfill(response);
          return typeof route.fulfill === 'function' ? route.fulfill(fulfillOptions) : (route as any).respond(fulfillOptions);
        } catch (error) {
          debug('Cache interception failed for browser, continuing: %o', error);
          try {
            return typeof route.continue === 'function' ? route.continue() : undefined;
          } catch (e) {
            debug('Failed to call route.continue: %o', e);
          }
        }
      };

      if (typeof page.route === 'function') {
        await page.route(crawleeReq.url, interceptor);
      }
      else if (typeof page.setRequestInterception === 'function') {
        try {
          await page.setRequestInterception(true);
          const handler = async (req: any) => {
            if (req.url() === crawleeReq.url) {
              await interceptor(req);
            } else {
              try {
                await req.continue();
              } catch (e) {
                debug('Failed to continue non-target request: %o', e);
              }
            }
          };
          page.on('request', handler);
          page.once('response', () => page.off('request', handler));
        } catch (e) {
          debug('Failed to set Puppeteer interception: %o', e);
        }
      }

    } else if (crawler && !(crawler as any)._proxyWrapped) {
      // --- 场景 B: HTTP 引擎 (CheerioCrawler/JSDOMCrawler) ---
      // 用户指出在 Hook 中修改实例不够优雅，因此我们将其逻辑抽离到 setupHttpCrawlerCache
      setupHttpCrawlerCache(crawler, options);
    }
  };
}
