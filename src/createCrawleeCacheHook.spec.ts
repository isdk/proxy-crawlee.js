import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCrawleeCacheHook } from './createCrawleeCacheHook';
import { generateCacheKey, SmartCache } from '@isdk/proxy';
import CachePolicy from 'http-cache-semantics';
import path from 'path';
import fs from 'fs';
import os from 'os';

describe('createCrawleeCacheHook', () => {
  let cache: SmartCache;
  let storagePath: string;
  const config = { default: { methods: ['GET'], forceCache: true } };

  beforeEach(() => {
    storagePath = path.join(os.tmpdir(), `proxy-test-hook-${Date.now()}`);
    cache = new SmartCache({ storagePath });
  });

  afterEach(async () => {
    await cache.clear();
    if (fs.existsSync(storagePath)) {
      fs.rmSync(storagePath, { recursive: true, force: true });
    }
    vi.clearAllMocks();
  });

  it('应该支持 Cheerio 环境下的拦截', async () => {
    // 模拟 CheerioCrawler 的原始请求函数（返回 Got 格式响应）
    const mockOriginalRequest = vi.fn().mockResolvedValue({
      statusCode: 200,
      statusMessage: 'OK',
      headers: { 'content-type': 'text/plain' },
      body: Buffer.from('original-response'),
      url: 'https://cheerio.com'
    });

    const mockCrawler: any = {
      _requestFunction: mockOriginalRequest
    };

    const hook = createCrawleeCacheHook({ cache, config: config.default });

    const context = {
      request: { url: 'https://cheerio.com', method: 'GET' },
      crawler: mockCrawler
    };

    await hook(context as any);

    // 验证 crawler 被包装
    expect(mockCrawler._proxyWrapped).toBe(true);

    // 调用被包装后的 _requestFunction
    const res = await mockCrawler._requestFunction({ request: context.request });

    expect(res.body.toString()).toBe('original-response');
    expect(mockOriginalRequest).toHaveBeenCalledTimes(1);

    // 再次请求应命中缓存
    const res2 = await mockCrawler._requestFunction({ request: context.request });
    expect(res2.isFromCache).toBe(true);
    expect(mockOriginalRequest).toHaveBeenCalledTimes(1); // 原始请求只被调用一次
  });

  it('应该支持 Playwright 环境下的拦截', async () => {
    const mockFetcher = vi.fn().mockResolvedValue(new Response('browser', { status: 200 }));
    const hook = createCrawleeCacheHook({ cache, config: config.default, fetcher: mockFetcher });

    let routeHandler: any;
    const mockPage = {
      route: vi.fn().mockImplementation((url, handler) => { routeHandler = handler; })
    };
    const context = {
      request: { url: 'https://playwright.com', method: 'GET' },
      page: mockPage
    };

    await hook(context as any);
    // Playwright 使用通配符 '**/*' 拦截所有请求，URL 过滤在 interceptor 内部处理
    expect(mockPage.route).toHaveBeenCalledWith('**/*', expect.any(Function));

    const mockRoute = {
      request: () => ({
        url: () => 'https://playwright.com',
        method: () => 'GET',
        isNavigationRequest: () => true,
        resourceType: () => 'document',
      }),
      fulfill: vi.fn()
    };

    await routeHandler(mockRoute);
    expect(mockRoute.fulfill).toHaveBeenCalledWith(expect.objectContaining({ body: expect.any(Buffer) }));
    expect(mockFetcher).toHaveBeenCalledTimes(1);
  });

  it('应该支持并发请求合并 (Request Coalescing)', async () => {
    const activeCacheWrites = new Map<string, Promise<void>>();

    // 模拟延迟的原始请求函数
    const mockOriginalRequest = vi.fn().mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 50));
      return {
        statusCode: 200,
        statusMessage: 'OK',
        headers: { 'content-type': 'text/plain' },
        body: Buffer.from('coalesced'),
        url: 'https://coalesce.com'
      };
    });

    const mockCrawler = { _requestFunction: mockOriginalRequest };

    const hook = createCrawleeCacheHook({
      cache,
      config: config.default,
      activeCacheWrites
    });

    const context = {
      request: { url: 'https://coalesce.com', method: 'GET' },
      crawler: mockCrawler
    };

    await hook(context as any);

    // 并发调用两次 _requestFunction
    const [r1, r2] = await Promise.all([
      mockCrawler._requestFunction({ request: context.request }),
      mockCrawler._requestFunction({ request: context.request })
    ]);

    expect(r1.body.toString()).toBe('coalesced');
    expect(r2.body.toString()).toBe('coalesced');
    expect(mockOriginalRequest).toHaveBeenCalledTimes(1); // 只调用一次（合并）
  });

  it('当 navigationOnly 为 true 时，不应拦截静态资源请求', async () => {
    const hook = createCrawleeCacheHook({ cache, config: config.default, navigationOnly: true });

    let routeHandler: any;
    const mockPage = {
      route: vi.fn().mockImplementation((url, handler) => { routeHandler = handler; })
    };
    const context = {
      request: { url: 'https://test.com/script.js', method: 'GET' },
      page: mockPage
    };

    await hook(context as any);

    const mockRoute = {
      request: () => ({
        url: () => 'https://test.com/script.js',
        method: () => 'GET',
        isNavigationRequest: () => false, // 模拟非导航请求
        resourceType: () => 'script',
      }),
      continue: vi.fn(),
      fulfill: vi.fn()
    };

    await routeHandler(mockRoute);

    // 应该直接调用 continue 而不是 fulfill
    expect(mockRoute.continue).toHaveBeenCalled();
    expect(mockRoute.fulfill).not.toHaveBeenCalled();
  });

  it('当核心缓存逻辑抛错时，应优雅回退 (route.continue)', async () => {
    const hook = createCrawleeCacheHook({ cache, config: config.default });

    let routeHandler: any;
    const mockPage = {
      route: vi.fn().mockImplementation((url, handler) => { routeHandler = handler; })
    };
    const context = {
      request: { url: 'https://error.com', method: 'GET' },
      page: mockPage
    };

    await hook(context as any);

    const mockRoute = {
      request: () => { throw new Error('Simulated Fatal Error'); },
      continue: vi.fn(),
      fulfill: vi.fn()
    };

    await routeHandler(mockRoute);

    // 即使内部出错，也必须确保调用了 continue，防止页面挂起
    expect(mockRoute.continue).toHaveBeenCalled();
  });

  it('应该支持 POST 请求的缓存 (通过 Payload 生成指纹)', async () => {
    // 模拟 POST 请求的原始请求函数
    const mockOriginalRequest = vi.fn().mockImplementation(async (opts) => {
      const payload = opts.request.payload;
      return {
        statusCode: 200,
        statusMessage: 'OK',
        headers: { 'content-type': 'application/json' },
        body: Buffer.from(`response-for-${JSON.stringify(payload)}`),
        url: 'https://post-cache.com'
      };
    });

    const mockCrawler = { _requestFunction: mockOriginalRequest };

    // 配置支持 POST 缓存
    const postConfig = { methods: ['GET', 'POST'], forceCache: true };
    const hook = createCrawleeCacheHook({ cache, config: postConfig });

    const context = {
      request: {
        url: 'https://post-cache.com',
        method: 'POST',
        payload: { id: 123 }
      },
      crawler: mockCrawler
    };

    await hook(context as any);

    // 第一次请求
    const res1 = await mockCrawler._requestFunction({ request: context.request });
    expect(res1.body.toString()).toBe('response-for-{"id":123}');
    expect(mockOriginalRequest).toHaveBeenCalledTimes(1);

    // 第二次请求 (相同的 Payload)
    const res2 = await mockCrawler._requestFunction({ request: context.request });
    expect(res2.body.toString()).toBe('response-for-{"id":123}');
    expect(res2.isFromCache).toBe(true);
    expect(mockOriginalRequest).toHaveBeenCalledTimes(1); // 命中缓存
  });

  it('应该支持 stale-if-error 容灾', async () => {
    const errorConfig = { methods: ['GET'], staleIfError: true };

    const request = { url: 'https://stale.com', method: 'GET', headers: {} };

    // 1. 先创建一个能成功返回的 crawler，存入过期缓存
    const mockOriginalRequestSuccess = vi.fn().mockResolvedValue({
      statusCode: 200,
      statusMessage: 'OK',
      headers: { 'cache-control': 'public, max-age=1', 'content-type': 'text/plain' },
      body: Buffer.from('old-data'),
      url: request.url
    });

    const mockCrawlerSuccess = { _requestFunction: mockOriginalRequestSuccess };
    const hookSuccess = createCrawleeCacheHook({ cache, config: errorConfig });
    const contextSuccess = { request, crawler: mockCrawlerSuccess };
    await hookSuccess(contextSuccess as any);
    await mockCrawlerSuccess._requestFunction({ request });

    // 2. 获取正确的 Cache Key 并手动设置过期
    const webReq = new Request(request.url, { method: request.method });
    const cacheKey = await generateCacheKey(webReq, errorConfig);

    const policy = new CachePolicy(
      { url: request.url, method: 'GET', headers: {} },
      { status: 200, headers: { 'cache-control': 'public, max-age=1' } }
    );
    const policyObj = policy.toObject();
    policyObj.t = Date.now() - 10000; // 强制设为已过期

    await cache.set(cacheKey, Buffer.from('old-data'), {
      status: 200,
      headers: { 'content-type': 'text/plain' },
      url: request.url,
      method: 'GET',
      timestamp: Date.now() - 10000,
      policy: policyObj
    } as any);

    // 3. 创建会失败的 crawler，关闭 backgroundUpdate 以确保同步进入错误处理
    const mockOriginalRequestFail = vi.fn().mockRejectedValue(new Error('Site Down'));
    const mockCrawlerFail = { _requestFunction: mockOriginalRequestFail };
    const hookFail = createCrawleeCacheHook({
      cache,
      config: errorConfig,
      backgroundUpdate: false
    });
    const contextFail = { request, crawler: mockCrawlerFail };
    await hookFail(contextFail as any);

    // 4. 执行请求，应触发 stale-if-error 返回旧数据
    const res = await mockCrawlerFail._requestFunction({ request });
    expect(res.body.toString()).toBe('old-data');
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-proxy-cache']).toBe('STALE_IF_ERROR');
  });

  it('应该在返回 STALE 后正确触发后台异步更新', async () => {
    const activeCacheWrites = new Map<string, Promise<void>>();

    // 模拟会返回新数据的原始请求函数
    const mockOriginalRequest = vi.fn().mockImplementation(async () => ({
      statusCode: 200,
      statusMessage: 'OK',
      headers: { 'cache-control': 'public, max-age=3600', 'content-type': 'text/plain' },
      body: Buffer.from('new-data'),
      url: 'https://swr.com'
    }));

    const mockCrawler = { _requestFunction: mockOriginalRequest };

    const hook = createCrawleeCacheHook({
      cache,
      config: config.default,
      backgroundUpdate: true,
      activeCacheWrites
    });

    const request = { url: 'https://swr.com', method: 'GET', headers: {} };
    const context = { request, crawler: mockCrawler };
    await hook(context as any);

    // 预设一个已过期的缓存
    const webReq = new Request(request.url);
    const cacheKey = await generateCacheKey(webReq, config.default);
    const policy = new CachePolicy({ url: request.url, method: 'GET', headers: {} }, { status: 200, headers: { 'cache-control': 'public, max-age=1' } });
    const policyObj = policy.toObject();
    policyObj.t = Date.now() - 5000;

    await cache.set(cacheKey, Buffer.from('old-data'), {
      status: 200, headers: {}, url: request.url, method: 'GET', timestamp: Date.now() - 5000, policy: policyObj
    } as any);

    // 执行请求，应立即返回 STALE
    const res = await mockCrawler._requestFunction({ request });
    expect(res.body.toString()).toBe('old-data');
    expect(res.headers['x-proxy-cache']).toBe('STALE');

    // 等待后台异步更新 Promise 完成
    await new Promise(r => setTimeout(r, 20));
    await Promise.all(activeCacheWrites.values());

    expect(mockOriginalRequest).toHaveBeenCalledTimes(1);

    // 再次请求，应该拿到更新后的数据 (HIT)
    const res2 = await mockCrawler._requestFunction({ request });
    expect(res2.body.toString()).toBe('new-data');
    expect(res2.headers['x-proxy-cache']).toBe('HIT');
  });

  it('应该支持 query 排除逻辑，确保随机参数不影响缓存指纹', async () => {
    const configWithExclude = {
      methods: ['GET'],
      query: { exclude: ['timestamp'] }
    };

    // 模拟原始请求函数 - 用于被 hook 包装后的 crawler
    const mockOriginalRequest = vi.fn().mockResolvedValue({
      statusCode: 200,
      statusMessage: 'OK',
      headers: { 'content-type': 'text/plain' },
      body: Buffer.from('data'),
      url: 'https://query.com'
    });

    // 创建一个 mock crawler
    const mockCrawler = { _requestFunction: mockOriginalRequest };
    const hook = createCrawleeCacheHook({ cache, config: configWithExclude });

    // 第一个请求带 timestamp=1
    const context1 = {
      request: { url: 'https://query.com?id=1&timestamp=1', method: 'GET' },
      crawler: mockCrawler
    };
    await hook(context1 as any);
    await mockCrawler._requestFunction({ request: context1.request });
    expect(mockOriginalRequest).toHaveBeenCalledTimes(1);

    // 第二个请求带 timestamp=2 (排除 timestamp 后 URL 相同，应该命中缓存)
    // 不需要新的 crawler，hook 已经包装了 mockCrawler
    const context2 = {
      request: { url: 'https://query.com?id=1&timestamp=2', method: 'GET' },
      crawler: mockCrawler
    };
    await hook(context2 as any);
    const res2 = await mockCrawler._requestFunction({ request: context2.request });

    // 原始请求仍只被调用 1 次，因为第二次请求命中缓存
    expect(mockOriginalRequest).toHaveBeenCalledTimes(1);
    // 响应应该有缓存标记
    expect(res2.headers['x-proxy-cache']).toBe('HIT');
  });

  it('应该能够正确处理并缓存重定向响应 (301)', async () => {
    // 模拟返回 301 重定向的原始请求函数
    const mockOriginalRequest = vi.fn().mockResolvedValue({
      statusCode: 301,
      statusMessage: 'Moved Permanently',
      headers: { 'location': 'https://target.com', 'content-type': 'text/html' },
      body: Buffer.from('Redirecting...'),
      url: 'https://source.com'
    });

    const mockCrawler = { _requestFunction: mockOriginalRequest };
    const hook = createCrawleeCacheHook({ cache, config: config.default });

    const context = {
      request: { url: 'https://source.com', method: 'GET' },
      crawler: mockCrawler
    };

    await hook(context as any);

    const res = await mockCrawler._requestFunction({ request: context.request });
    expect(res.statusCode).toBe(301);
    expect(res.headers['location']).toBe('https://target.com');

    // 第二次请求应 HIT
    const res2 = await mockCrawler._requestFunction({ request: context.request });
    expect(res2.isFromCache).toBe(true);
    expect(res2.statusCode).toBe(301);
  });

  it('应该能够正确处理并缓存二进制内容 (如图片)', async () => {
    const binaryData = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]); // PNG header

    // 模拟返回二进制数据的原始请求函数
    const mockOriginalRequest = vi.fn().mockResolvedValue({
      statusCode: 200,
      statusMessage: 'OK',
      headers: { 'content-type': 'image/png' },
      body: binaryData,
      url: 'https://image.com/logo.png'
    });

    const mockCrawler = { _requestFunction: mockOriginalRequest };
    const hook = createCrawleeCacheHook({ cache, config: config.default });

    const context = {
      request: { url: 'https://image.com/logo.png', method: 'GET' },
      crawler: mockCrawler
    };

    await hook(context as any);

    const res = await mockCrawler._requestFunction({ request: context.request });
    expect(res.body).toEqual(binaryData);
    expect(res.headers['content-type']).toBe('image/png');

    // 命中缓存验证
    const res2 = await mockCrawler._requestFunction({ request: context.request });
    expect(res2.isFromCache).toBe(true);
    expect(res2.body).toEqual(binaryData);
  });

  it('在并发请求合并时，如果网络请求失败，所有等待者都应收到错误', async () => {
    const activeCacheWrites = new Map<string, Promise<void>>();

    // 模拟会失败的原始请求函数
    const mockOriginalRequest = vi.fn().mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 50));
      throw new Error('Network Down');
    });

    const mockCrawler = { _requestFunction: mockOriginalRequest };
    const hook = createCrawleeCacheHook({
      cache,
      config: config.default,
      activeCacheWrites
    });

    const context = {
      request: { url: 'https://fail.com', method: 'GET' },
      crawler: mockCrawler
    };

    await hook(context as any);

    // 发起两个并发请求
    const p1 = mockCrawler._requestFunction({ request: context.request });
    const p2 = mockCrawler._requestFunction({ request: context.request });

    await expect(p1).rejects.toThrow('Network Down');
    await expect(p2).rejects.toThrow('Network Down');

    // 确保原始请求只被调用了一次
    expect(mockOriginalRequest).toHaveBeenCalledTimes(1);
  });

  it('应该支持后台更新的并发合并，防止多个并发请求触发重复的后台刷新', async () => {
    const activeCacheWrites = new Map<string, Promise<void>>();

    // 模拟会返回新数据的原始请求函数
    const mockOriginalRequest = vi.fn().mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 50));
      return {
        statusCode: 200,
        statusMessage: 'OK',
        headers: { 'cache-control': 'public, max-age=3600', 'content-type': 'text/plain' },
        body: Buffer.from('new-data'),
        url: 'https://swr-coalesce.com'
      };
    });

    const mockCrawler = { _requestFunction: mockOriginalRequest };
    const hook = createCrawleeCacheHook({
      cache,
      config: config.default,
      backgroundUpdate: true,
      activeCacheWrites
    });

    const request = { url: 'https://swr-coalesce.com', method: 'GET' };
    const context = { request, crawler: mockCrawler };
    await hook(context as any);

    // 预设已过期缓存
    const webReq = new Request(request.url);
    const cacheKey = await generateCacheKey(webReq, config.default);
    const policy = new CachePolicy({ url: request.url, method: 'GET', headers: {} }, { status: 200, headers: { 'cache-control': 'public, max-age=1' } });
    const policyObj = policy.toObject();
    policyObj.t = Date.now() - 5000;
    await cache.set(cacheKey, Buffer.from('old-data'), {
      status: 200, headers: {}, url: request.url, method: 'GET', timestamp: Date.now() - 5000, policy: policyObj
    } as any);

    // 同时发起两个并发请求，它们都应该命中 STALE
    const [res1, res2] = await Promise.all([
      mockCrawler._requestFunction({ request }),
      mockCrawler._requestFunction({ request })
    ]);

    expect(res1.headers['x-proxy-cache']).toBe('STALE');
    expect(res2.headers['x-proxy-cache']).toBe('STALE');

    // 等待后台更新完成
    await new Promise(r => setTimeout(r, 20));
    await Promise.all(activeCacheWrites.values());

    // 关键断言：即使有两个 STALE 请求，原始请求函数应该只被调用一次
    expect(mockOriginalRequest).toHaveBeenCalledTimes(1);
  });

  it('应该遵循 cacheRules 规则，正确忽略不符合条件的请求', async () => {
    const configWithRules = {
      methods: ['GET'],
      cacheRules: [
        { path: '/api/**' } // 仅缓存 /api 路径
      ]
    };

    // 模拟原始请求函数
    const mockOriginalRequest = vi.fn().mockResolvedValue({
      statusCode: 200,
      statusMessage: 'OK',
      headers: { 'content-type': 'text/plain' },
      body: Buffer.from('data'),
      url: 'https://site.com'
    });

    const hook = createCrawleeCacheHook({ cache, config: configWithRules });

    // 请求 /home (不应缓存)
    const mockCrawler1 = { _requestFunction: mockOriginalRequest };
    const context1 = { request: { url: 'https://site.com/home', method: 'GET' }, crawler: mockCrawler1 };
    await hook(context1 as any);
    const res1 = await mockCrawler1._requestFunction({ request: context1.request });
    expect(res1.isFromCache).toBeFalsy();
    expect(res1.headers['x-proxy-cache']).toBeUndefined(); // 根本没进入缓存流程

    // 请求 /api/user (应缓存)
    const mockCrawler2 = { _requestFunction: mockOriginalRequest };
    const context2 = { request: { url: 'https://site.com/api/user', method: 'GET' }, crawler: mockCrawler2 };
    await hook(context2 as any);
    const res2 = await mockCrawler2._requestFunction({ request: context2.request });
    expect(res2.headers['x-proxy-cache']).toBe('MISS');
  });
});
