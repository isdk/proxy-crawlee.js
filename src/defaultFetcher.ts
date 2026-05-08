import { debug as debugFactory } from 'debug';
import { gotResponseToWebResponse } from './gotResponseToWebResponse';

const debug = debugFactory('@isdk/proxy:adapters:crawlee:fetcher');

/**
 * 默认的 Fetcher 实现，优先使用 got-scraping。
 * 采用动态引入以保持轻量。
 */
export async function defaultFetcher(request: Request): Promise<Response> {
  try {
    // 动态引入 got-scraping，避免强依赖
    // @ts-ignore
    const { gotScraping } = await import('got-scraping');
    const response = await gotScraping({
      url: request.url,
      method: request.method as any,
      headers: Object.fromEntries(request.headers),
      body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.text() : undefined,
      responseType: 'buffer',
      retry: { limit: 0 }, // 禁用内部重试，交由 Crawlee 处理
    });
    return gotResponseToWebResponse(response);
  } catch (e) {
    debug('got-scraping not found or failed, falling back to native fetch: %o', e);
    return fetch(request);
  }
}
