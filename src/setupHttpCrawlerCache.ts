import { createResponse, debug as debugFactory } from '@isdk/proxy';
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
export function setupHttpCrawlerCache(crawler: any, options: CrawleeCacheOptions, fetchWithCacheBound: any) {
  if ((crawler as any)._proxyWrapped) return;
  (crawler as any)._proxyWrapped = true;

  const {
    backgroundUpdate = true,
  } = options;

  const originalRequestFunction = (crawler as any)._requestFunction.bind(crawler);

  (crawler as any)._requestFunction = async function(opts: any) {
    // opts 结构: { request, session, proxyUrl, gotOptions }
    const webReq = crawleeToWebRequest({ ...opts.request, ...opts.gotOptions });

    return await fetchWithCacheBound(
      webReq,
      async (innerReq: Request) => {
        debug('Cache MISS, calling original _requestFunction for: %s', innerReq.url);
        // 我们依然使用原始的 opts 以保留 Crawlee 特有的 session/proxyUrl 等状态，
        // 但如果缓存层修改了 URL，我们应该同步它
        if (innerReq.url !== webReq.url) {
          opts.request.url = innerReq.url;
          if (opts.gotOptions) opts.gotOptions.url = innerReq.url;
        }
        const gotRes = await originalRequestFunction(opts);
        return gotResponseToWebResponse(gotRes);
      },
      { ...options, backgroundUpdate }
    ).then(async (webRes: any) => {
      // 容错：如果 webRes.url 依然为空，则从请求中恢复
      if (!webRes.url || webRes.url === '') {
        webRes = createResponse(webRes.body, {
          status: webRes.status,
          statusText: webRes.statusText,
          headers: webRes.headers,
          url: webReq.url,
        });
      }

      debug('Cache Result for %s: %s', webRes.url, webRes.headers.get('x-proxy-cache'));
      return await webResponseToGotResponse(webRes);
    });
  };

  // 劫持手动请求入口 (sendRequest)
  if (crawler.httpClient && typeof crawler.httpClient.sendRequest === 'function') {
    const originalSendRequest = crawler.httpClient.sendRequest.bind(crawler.httpClient);
    crawler.httpClient.sendRequest = async function(requestOpts: any) {
      const webReq = crawleeToWebRequest(requestOpts);

      return await fetchWithCacheBound(
        webReq,
        async (innerReq: Request) => {
          debug('Cache MISS, calling original httpClient.sendRequest for: %s', innerReq.url);
          // 同步 URL 修改
          if (innerReq.url !== webReq.url) {
            if (typeof requestOpts === 'string') {
              requestOpts = innerReq.url;
            } else {
              requestOpts.url = innerReq.url;
            }
          }
          const gotRes = await originalSendRequest(requestOpts);
          return gotResponseToWebResponse(gotRes);
        },
        { ...options, backgroundUpdate }
      ).then(async (webRes: any) => {
        debug('Cache Result (sendRequest) for %s: %s', webRes.url, webRes.headers.get('x-proxy-cache'));
        return await webResponseToGotResponse(webRes);
      });
    };
  }

  debug('Successfully hijacked crawler for caching');
}
