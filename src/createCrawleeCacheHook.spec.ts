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
    const mockFetcher = vi.fn().mockResolvedValue(new Response('hello', { status: 200 }));
    const hook = createCrawleeCacheHook({ cache, config: config.default, fetcher: mockFetcher });

    const context = {
      request: { url: 'https://cheerio.com', method: 'GET' },
      gotOptions: { handlers: [] }
    };

    await hook(context as any);
    expect(context.gotOptions.handlers.length).toBe(1);

    const handler: any = context.gotOptions.handlers[0];
    const res = await handler({}, vi.fn());

    expect(res.body.toString()).toBe('hello');
    expect(mockFetcher).toHaveBeenCalledTimes(1);

    // 再次请求应命中缓存
    await handler({}, vi.fn());
    expect(mockFetcher).toHaveBeenCalledTimes(1);
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
    expect(mockPage.route).toHaveBeenCalledWith('https://playwright.com', expect.any(Function));

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
    const mockFetcher = vi.fn().mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 50));
      return new Response('coalesced', { status: 200 });
    });

    const hook = createCrawleeCacheHook({
      cache,
      config: config.default,
      fetcher: mockFetcher,
      activeCacheWrites
    });

    const context = {
      request: { url: 'https://coalesce.com', method: 'GET' },
      gotOptions: { handlers: [] }
    };

    await hook(context as any);
    const handler: any = context.gotOptions.handlers[0];

    const [r1, r2] = await Promise.all([
      handler({}, vi.fn()),
      handler({}, vi.fn())
    ]);

    expect(r1.body.toString()).toBe('coalesced');
    expect(r2.body.toString()).toBe('coalesced');
    expect(mockFetcher).toHaveBeenCalledTimes(1);
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
    const mockFetcher = vi.fn().mockImplementation(async (req) => {
      const text = await req.text();
      return new Response(`response-for-${text}`, { status: 200 });
    });

    // 配置支持 POST 缓存
    const postConfig = { methods: ['GET', 'POST'], forceCache: true };
    const hook = createCrawleeCacheHook({ cache, config: postConfig, fetcher: mockFetcher });

    const context = {
      request: {
        url: 'https://post-cache.com',
        method: 'POST',
        payload: { id: 123 } // 对象格式 Payload
      },
      gotOptions: { handlers: [] }
    };

    await hook(context as any);
    const handler: any = context.gotOptions.handlers[0];

    // 第一次请求
    const res1 = await handler({}, vi.fn());
    expect(res1.body.toString()).toBe('response-for-{"id":123}');
    expect(mockFetcher).toHaveBeenCalledTimes(1);

    // 第二次请求 (相同的 Payload)
    const res2 = await handler({}, vi.fn());
    expect(res2.body.toString()).toBe('response-for-{"id":123}');
    expect(res2.isFromCache).toBe(true);
    expect(mockFetcher).toHaveBeenCalledTimes(1); // 命中缓存
  });

  it('应该支持 stale-if-error 容灾', async () => {
    const errorConfig = { methods: ['GET'], staleIfError: true };
    const hook = createCrawleeCacheHook({ cache, config: errorConfig });

    const request = { url: 'https://stale.com', method: 'GET', headers: {} };
    const context = {
      request,
      gotOptions: { handlers: [] }
    };

    await hook(context as any);
    const handler: any = context.gotOptions.handlers[0];

    // 1. 获取正确的 Cache Key 并先成功请求一次，存入缓存（已过期）
    const webReq = new Request(request.url, { method: request.method });
    const cacheKey = await generateCacheKey(webReq, errorConfig);

    const policy = new CachePolicy(
      { url: request.url, method: 'GET', headers: {} },
      { status: 200, headers: { 'cache-control': 'public, max-age=1' } }
    );
    // 强制设置过期时间到过去
    const policyObj = policy.toObject();
    policyObj.t = Date.now() - 10000;

    await cache.set(cacheKey, Buffer.from('old-data'), {
      status: 200,
      headers: { 'content-type': 'text/plain' },
      url: request.url,
      method: 'GET',
      timestamp: Date.now() - 10000,
      policy: policyObj
    } as any);

    // 2. 模拟 Fetcher 失败，且关闭 backgroundUpdate 以确保同步进入错误处理
    const mockFetcher = vi.fn().mockRejectedValue(new Error('Site Down'));
    const hookWithError = createCrawleeCacheHook({
      cache,
      config: errorConfig,
      fetcher: mockFetcher,
      backgroundUpdate: false
    });
    await hookWithError(context as any);
    const handlerWithError: any = context.gotOptions.handlers[1];

    // 3. 执行请求，应触发 stale-if-error 返回旧数据
    const res = await handlerWithError({}, vi.fn());
    expect(res.body.toString()).toBe('old-data');
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-proxy-cache']).toBe('STALE_IF_ERROR');
  });

  it('应该在返回 STALE 后正确触发后台异步更新', async () => {
    const mockFetcher = vi.fn().mockImplementation(async () => new Response('new-data', {
      status: 200,
      headers: { 'cache-control': 'public, max-age=3600' } // 确保更新后的数据是新鲜的
    }));
    const activeCacheWrites = new Map<string, Promise<void>>();
    const hook = createCrawleeCacheHook({
      cache,
      config: config.default,
      fetcher: mockFetcher,
      backgroundUpdate: true,
      activeCacheWrites
    });

    const request = { url: 'https://swr.com', method: 'GET', headers: {} };
    const context = { request, gotOptions: { handlers: [] } };
    await hook(context as any);
    const handler: any = context.gotOptions.handlers[0];

    // 预设一个已过期的缓存
    const webReq = new Request(request.url);
    const cacheKey = await generateCacheKey(webReq, config.default);
    const policy = new CachePolicy({ url: request.url, method: 'GET', headers: {} }, { status: 200, headers: { 'cache-control': 'public, max-age=1' } });
    const policyObj = policy.toObject();
    policyObj.t = Date.now() - 5000; // 强制设为 5 秒前

    await cache.set(cacheKey, Buffer.from('old-data'), {
      status: 200, headers: {}, url: request.url, method: 'GET', timestamp: Date.now() - 5000, policy: policyObj
    } as any);

    // 执行请求，应立即返回 STALE
    const res = await handler({}, vi.fn());
    expect(res.body.toString()).toBe('old-data');
    expect(res.headers['x-proxy-cache']).toBe('STALE');

    // 等待后台异步更新 Promise 完成
    await new Promise(r => setTimeout(r, 20));
    await Promise.all(activeCacheWrites.values());

    expect(mockFetcher).toHaveBeenCalledTimes(1);

    // 再次请求，应该拿到更新后的数据 (HIT)
    const res2 = await handler({}, vi.fn());
    expect(res2.body.toString()).toBe('new-data');
    expect(res2.headers['x-proxy-cache']).toBe('HIT');
  });

  it('应该支持 query 排除逻辑，确保随机参数不影响缓存指纹', async () => {
    const configWithExclude = {
      methods: ['GET'],
      query: { exclude: ['timestamp'] }
    };
    const mockFetcher = vi.fn().mockImplementation(async () => new Response('data', { status: 200 }));
    const hook = createCrawleeCacheHook({ cache, config: configWithExclude, fetcher: mockFetcher });

    // 第一个请求带 timestamp=1
    const context1 = {
      request: { url: 'https://query.com?id=1&timestamp=1', method: 'GET' },
      gotOptions: { handlers: [] }
    };
    await hook(context1 as any);
    const handler1: any = context1.gotOptions.handlers[0];
    await handler1({}, vi.fn());
    expect(mockFetcher).toHaveBeenCalledTimes(1);

    // 第二个请求带 timestamp=2 (应该 HIT)
    const context2 = {
      request: { url: 'https://query.com?id=1&timestamp=2', method: 'GET' },
      gotOptions: { handlers: [] }
    };
    await hook(context2 as any);
    const handler2: any = context2.gotOptions.handlers[0];
    const res2 = await handler2({}, vi.fn());

    expect(res2.isFromCache).toBe(true);
    expect(mockFetcher).toHaveBeenCalledTimes(1); // 依然只有 1 次调用
  });

  it('应该能够正确处理并缓存重定向响应 (301)', async () => {
    const mockFetcher = vi.fn().mockImplementation(async () => new Response(null, {
      status: 301,
      headers: { 'Location': 'https://target.com' }
    }));
    const hook = createCrawleeCacheHook({ cache, config: config.default, fetcher: mockFetcher });

    const context = {
      request: { url: 'https://source.com', method: 'GET' },
      gotOptions: { handlers: [] }
    };
    await hook(context as any);
    const handler: any = context.gotOptions.handlers[0];

    const res = await handler({}, vi.fn());
    expect(res.statusCode).toBe(301);
    expect(res.headers['location']).toBe('https://target.com');

    // 第二次请求应 HIT
    const res2 = await handler({}, vi.fn());
    expect(res2.isFromCache).toBe(true);
    expect(res2.statusCode).toBe(301);
  });

  it('应该能够正确处理并缓存二进制内容 (如图片)', async () => {
    const binaryData = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]); // PNG header
    const mockFetcher = vi.fn().mockImplementation(async () => new Response(binaryData, {
      status: 200,
      headers: { 'Content-Type': 'image/png' }
    }));
    const hook = createCrawleeCacheHook({ cache, config: config.default, fetcher: mockFetcher });

    const context = {
      request: { url: 'https://image.com/logo.png', method: 'GET' },
      gotOptions: { handlers: [] }
    };
    await hook(context as any);
    const handler: any = context.gotOptions.handlers[0];

    const res = await handler({}, vi.fn());
    expect(res.body).toEqual(binaryData);
    expect(res.headers['content-type']).toBe('image/png');

    // 命中缓存验证
    const res2 = await handler({}, vi.fn());
    expect(res2.isFromCache).toBe(true);
    expect(res2.body).toEqual(binaryData);
  });

  it('在并发请求合并时，如果网络请求失败，所有等待者都应收到错误', async () => {
    const activeCacheWrites = new Map<string, Promise<void>>();
    const mockFetcher = vi.fn().mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 50));
      throw new Error('Network Down');
    });

    const hook = createCrawleeCacheHook({
      cache,
      config: config.default,
      fetcher: mockFetcher,
      activeCacheWrites
    });

    const context = {
      request: { url: 'https://fail.com', method: 'GET' },
      gotOptions: { handlers: [] }
    };
    await hook(context as any);
    const handler: any = context.gotOptions.handlers[0];

    // 发起两个并发请求
    const p1 = handler({}, vi.fn());
    const p2 = handler({}, vi.fn());

    await expect(p1).rejects.toThrow('Network Down');
    await expect(p2).rejects.toThrow('Network Down');

    // 确保底层 fetcher 只被调用了一次
    expect(mockFetcher).toHaveBeenCalledTimes(1);
  });

  it('应该支持后台更新的并发合并，防止多个并发请求触发重复的后台刷新', async () => {
    const mockFetcher = vi.fn().mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 50));
      return new Response('new-data', { status: 200, headers: { 'cache-control': 'public, max-age=3600' } });
    });
    const activeCacheWrites = new Map<string, Promise<void>>();
    const hook = createCrawleeCacheHook({
      cache,
      config: config.default,
      fetcher: mockFetcher,
      backgroundUpdate: true,
      activeCacheWrites
    });

    const request = { url: 'https://swr-coalesce.com', method: 'GET' };
    const context = { request, gotOptions: { handlers: [] } };
    await hook(context as any);
    const handler: any = context.gotOptions.handlers[0];

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
      handler({}, vi.fn()),
      handler({}, vi.fn())
    ]);

    expect(res1.headers['x-proxy-cache']).toBe('STALE');
    expect(res2.headers['x-proxy-cache']).toBe('STALE');

    // 等待后台更新完成
    await new Promise(r => setTimeout(r, 20));
    await Promise.all(activeCacheWrites.values());

    // 关键断言：即使有两个 STALE 请求，后台 fetcher 应该只被调用一次
    expect(mockFetcher).toHaveBeenCalledTimes(1);
  });

  it('应该遵循 cacheRules 规则，正确忽略不符合条件的请求', async () => {
    const configWithRules = {
      methods: ['GET'],
      cacheRules: [
        { path: '/api/**' } // 仅缓存 /api 路径
      ]
    };
    const mockFetcher = vi.fn().mockImplementation(async () => new Response('data', { status: 200 }));
    const hook = createCrawleeCacheHook({ cache, config: configWithRules, fetcher: mockFetcher });

    // 请求 /home (不应缓存)
    const context1 = { request: { url: 'https://site.com/home', method: 'GET' }, gotOptions: { handlers: [] } };
    await hook(context1 as any);
    const handler1: any = context1.gotOptions.handlers[0];
    const res1 = await handler1({}, vi.fn());
    expect(res1.isFromCache).toBeFalsy();
    expect(res1.headers['x-proxy-cache']).toBeUndefined(); // 根本没进入缓存流程

    // 请求 /api/user (应缓存)
    const context2 = { request: { url: 'https://site.com/api/user', method: 'GET' }, gotOptions: { handlers: [] } };
    await hook(context2 as any);
    const handler2: any = context2.gotOptions.handlers[0];
    const res2 = await handler2({}, vi.fn());
    expect(res2.headers['x-proxy-cache']).toBe('MISS');
  });
});
