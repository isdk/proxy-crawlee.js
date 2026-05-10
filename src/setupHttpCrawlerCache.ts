import { debug as debugFactory } from 'debug';
import { createFetchWithCache } from '@isdk/proxy';
import { CrawleeCacheOptions } from './types';
import { crawleeToWebRequest } from './crawleeToWebRequest';
import { gotResponseToWebResponse } from './gotResponseToWebResponse';
import { webResponseToGotResponse } from './webResponseToGotResponse';

const debug = debugFactory('@isdk/proxy:adapters:crawlee:http');

/**
 * 专门针对 HttpCrawler (CheerioCrawler) 的缓存设置函数。
 * 通过劫持 crawler._requestFunction 实现最底层的拦截，
 * 确保所有导航和手动请求都能正确处理缓存。
 */
export function setupHttpCrawlerCache(crawler: any, options: CrawleeCacheOptions) {
  if ((crawler as any)._proxyWrapped) return;

  const {
    cache,
    config,
    backgroundUpdate = true,
    activeCacheWrites = new Map<string, Promise<void>>()
  } = options;

  const fetchWithCacheBound = createFetchWithCache(activeCacheWrites);
  const originalRequestFunction = (crawler as any)._requestFunction.bind(crawler);

  (crawler as any)._requestFunction = async function(opts: any) {
    // opts 结构: { request, session, proxyUrl, gotOptions }
    const webReq = crawleeToWebRequest({ ...opts.request, ...opts.gotOptions });

    return await fetchWithCacheBound(
      webReq,
      async () => {
        debug('Cache MISS, calling original _requestFunction for: %s', webReq.url);
        const gotRes = await originalRequestFunction(opts);
        return gotResponseToWebResponse(gotRes);
      },
      { cache, config, backgroundUpdate }
    ).then(async (webRes) => {
      // 容错：如果 webRes.url 依然为空，则从请求中恢复
      if (!webRes.url || webRes.url === '') {
        Object.defineProperty(webRes, 'url', { value: webReq.url });
      }

      debug('Cache Result for %s: %s', webRes.url, webRes.headers.get('x-proxy-cache'));
      return await webResponseToGotResponse(webRes);
    });
  };

  (crawler as any)._proxyWrapped = true;
  debug('Successfully hijacked crawler._requestFunction');
}
