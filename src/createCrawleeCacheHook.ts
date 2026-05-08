import { debug as debugFactory } from 'debug';
import { createFetchWithCache } from '@isdk/proxy';
import { CrawleeCacheOptions, CrawleeContext } from './types';
import { crawleeToWebRequest } from './crawleeToWebRequest';
import { webResponseToFulfill } from './webResponseToFulfill';
import { defaultFetcher } from './defaultFetcher';
import { gotResponseToWebResponse } from './gotResponseToWebResponse';
import { webResponseToGotResponse } from './webResponseToGotResponse';

const debug = debugFactory('@isdk/proxy:adapters:crawlee');

/**
 * 创建一个通用的 Crawlee 缓存钩子，可用于 preNavigationHooks。
 *
 * 该钩子实现了“环境自适应”：
 * 1. 如果检测到浏览器环境 (Playwright/Puppeteer)，会自动设置请求路由拦截。
 * 2. 如果检测到 HTTP 环境 (CheerioCrawler)，会自动向 gotOptions 注入拦截 handler。
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

  return async (context: CrawleeContext) => {
    const { request: crawleeReq, page, gotOptions } = context;

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
              if (options.fetcher) return options.fetcher(innerReq);
              return defaultFetcher(innerReq);
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

    } else if (gotOptions) {
      // --- 场景 B: HTTP 引擎 (Cheerio/JSDOM) ---
      debug('Injecting cache handler into gotOptions for: %s', crawleeReq.url);

      gotOptions.handlers = gotOptions.handlers || [];
      gotOptions.handlers.push(async (gotOpts: any, next: any) => {
        const webReq = crawleeToWebRequest(crawleeReq);

        const webRes = await fetchWithCacheBound(
          webReq,
          async () => {
            if (options.fetcher) return options.fetcher(webReq);
            const gotRes = await next(gotOpts);
            return gotResponseToWebResponse(gotRes);
          },
          { cache, config, backgroundUpdate }
        );

        return webResponseToGotResponse(webRes);
      });
    }
  };
}
