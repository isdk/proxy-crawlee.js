import { createFetchWithCache, debug as debugFactory } from '@isdk/proxy';
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
      // 确保每个页面只设置一次拦截，避免重复注册导致的内存泄漏和嵌套路由死循环
      // 使用 page 对象上的专属标记，防止因模块被多次加载 (CJS/ESM) 导致的 WeakSet 失效
      if ((page as any).__isdkProxyIntercepted || INTERCEPTED_PAGES.has(page)) {
        return;
      }
      (page as any).__isdkProxyIntercepted = true;
      INTERCEPTED_PAGES.add(page);

      debug('Setting up browser cache interception for page');

      // 追踪当前正在被 route.fetch() 处理中的请求，用于阻断 Playwright 路由递归。
      // key 使用 @isdk/proxy 通过 this.cacheKey 提供的精确哈希值（包含 method+url+body 等指纹）。
      const inFlightFetches = new Set<string>();

      const interceptor = async (route: any) => {
        try {
          const req = route.request();
          const url = req.url();
          const method = req.method();
          const resourceType = req.resourceType();

          debug('Intercept: %s %s | Type: %s', method, url, resourceType);

          // 避免 Service Worker 导致的 route.fetch() 递归循环 (Service Worker 发起的请求 frame 为 null)
          if (!req.frame()) {
            debug('Skipping request from Service Worker (no frame): %s', url);
            return typeof route.fallback === 'function' ? route.fallback() : route.continue();
          }

          const isNavigation = req.isNavigationRequest();

          if (navigationOnly && !isNavigation) {
            debug('Skipping non-navigation request: %s', url);
            return typeof route.fallback === 'function' ? route.fallback() : route.continue();
          }

          debug('Intercepting request: %s', url);

          const webReq = crawleeToWebRequest(req);
          const response = await fetchWithCacheBound(
            webReq,
            // 必须使用普通函数（非箭头函数），以便通过 this 接收 @isdk/proxy 传入的缓存上下文
            // this.cacheKey: 由 proxy 核心计算的精确哈希（包含 method、url、body 等指纹）
            async function (this: any, innerReq: Request) {
              if (options.fetcher) return options.fetcher.call(this, innerReq);

              // 如果是 Playwright 环境，优先使用 route.fetch() 以复用浏览器上下文（Cookie、会话等）
              if (typeof route.fetch === 'function') {
                const cacheKey = this?.cacheKey;

                // 【核心防递归机制】
                // Playwright 的 route.fetch() 在处理 POST 请求时，会将请求重新投递回
                // 路由拦截管线，导致同一个 page.route('**/*') 拦截器再次被触发，形成死循环。
                // 通过 inFlightFetches Set 追踪正在处理中的请求：如果当前 cacheKey 已在 Set 中，
                // 说明这是 route.fetch() 触发的递归拦截，降级到 Node.js defaultFetcher 直接发起
                // 网络请求，从而彻底阻断递归。
                if (cacheKey && inFlightFetches.has(cacheKey)) {
                  debug('Detected route.fetch() recursion (cacheKey: %s), falling back to Node fetcher: %s', cacheKey, innerReq.url);
                  return defaultFetcher(innerReq);
                }

                if (cacheKey) {
                  inFlightFetches.add(cacheKey);
                }
                try {
                  debug('Using Playwright route.fetch() for: %s', innerReq.url);
                  const playwrightRes = await route.fetch();
                  debug('Playwright route.fetch() success: %s (Status: %s)', innerReq.url, playwrightRes.status());
                  const headers = playwrightRes.headers();
                  // Playwright 的 route.fetch() 会自动解压 (decompress) 响应体，
                  // 所以获取到的 body 已经是明文。如果原封不动地把 content-encoding (如 gzip)
                  // 和 content-length 塞回给浏览器，浏览器网络层在解压明文时会崩溃或永久挂起，导致页面卡死！
                  delete headers['content-encoding'];
                  delete headers['content-length'];

                  return new Response(await playwrightRes.body(), {
                    status: playwrightRes.status(),
                    statusText: playwrightRes.statusText(),
                    headers: headers,
                  });
                } catch (e) {
                  debug('Playwright route.fetch() failed, falling back to default fetcher: %o', e);
                } finally {
                  if (cacheKey) {
                    inFlightFetches.delete(cacheKey);
                  }
                }
              }

              return defaultFetcher(innerReq);
            },
            { ...options, backgroundUpdate }
          );

          const fulfillOptions = await webResponseToFulfill(response);
          return route.fulfill(fulfillOptions);
        } catch (error: any) {
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
      setupHttpCrawlerCache(crawler, options, fetchWithCacheBound);
    }
  };
}
