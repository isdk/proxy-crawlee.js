import { describe, it, expect, vi } from 'vitest';
import { defaultFetcher } from './defaultFetcher';

// 模拟动态导入的 got-scraping
vi.mock('got-scraping', () => ({
  gotScraping: vi.fn().mockImplementation(async (opts) => ({
    statusCode: 200,
    headers: { 'content-type': 'text/html' },
    body: Buffer.from(`<html>${opts.url}</html>`),
    rawBody: Buffer.from(`<html>${opts.url}</html>`)
  }))
}));

describe('defaultFetcher', () => {
  it('应该能正常发起请求并返回 Web 响应', async () => {
    const req = new Request('https://fetcher-test.com');
    const res = await defaultFetcher(req);

    expect(res.status).toBe(200);
    expect(await res.text()).toContain('https://fetcher-test.com');
  });

  it('如果 got-scraping 失败，应该尝试回退到原生 fetch', async () => {
    // 模拟原生 fetch 存在 (Node 18+)
    const globalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue(new Response('native-fetch'));

    // 让 got-scraping 抛错
    const { gotScraping } = await import('got-scraping');
    (gotScraping as any).mockRejectedValueOnce(new Error('Got failed'));

    const req = new Request('https://fallback.com');
    const res = await defaultFetcher(req);

    expect(await res.text()).toBe('native-fetch');
    
    // 还原
    global.fetch = globalFetch;
  });

  it('应该正确透传 Method 和 Headers 给 gotScraping', async () => {
    // @ts-ignore
    const { gotScraping } = await import('got-scraping');
    const req = new Request('https://passthrough.com', {
      method: 'PUT',
      headers: { 'X-Custom': 'val' }
    });
    
    await defaultFetcher(req);

    expect(gotScraping).toHaveBeenCalledWith(expect.objectContaining({
      method: 'PUT',
      headers: expect.objectContaining({ 'x-custom': 'val' })
    }));
  });
});
