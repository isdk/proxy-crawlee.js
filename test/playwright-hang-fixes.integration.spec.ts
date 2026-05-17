import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PlaywrightCrawler, Configuration } from 'crawlee';
import path from 'path';
import * as zlib from 'zlib';
import { createCrawleeCacheHook } from '../src/createCrawleeCacheHook';
import { setupIntegrationContext, IntegrationTestContext } from './helpers/integration-utils';

describe('Playwright Hang Fixes (Content-Encoding & Route Deadlock)', () => {
  let ctx: IntegrationTestContext;

  beforeEach(async () => {
    ctx = await setupIntegrationContext();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it('Issue 1: Should not hang on cold start when server returns compressed (gzip) response', async () => {
    // 验证没有 cache 的情况 (Cold Start)
    // 模拟服务端返回带有 content-encoding: gzip 的资源
    const { server, cache, config, activeCacheWrites, awaitCache } = ctx;

    server.setHandler('/api/data', (req, res) => {
      // 必须只处理 POST，模拟 api/feedback
      if (req.method !== 'POST') {
        res.status(405).send();
        return;
      }
      res.header('Content-Type', 'application/json');
      res.header('Cache-Control', 'public, max-age=60');
      res.header('Content-Encoding', 'gzip');

      const payload = JSON.stringify({ message: 'Success from compressed data' });
      const zipped = zlib.gzipSync(Buffer.from(payload));

      res.header('Content-Length', zipped.length.toString());
      res.send(zipped);
    });

    server.setHandler('/index.html', (req, res) => {
      res.header('Content-Type', 'text/html');
      res.send(`
        <html><body><script>
          fetch("/api/data", { method: "POST", body: JSON.stringify({ ping: true }) })
            .then(r => r.json())
            .then(d => window.data = d)
        </script></body></html>
      `);
    });

    const hook = createCrawleeCacheHook({
      cache,
      config,
      activeCacheWrites,
      navigationOnly: false // 必须设置为 false 才会拦截附加资源
    });

    let extractedData: any;

    const crawler = new PlaywrightCrawler({
      launchContext: { launchOptions: { headless: true } },
      preNavigationHooks: [hook],
      // 如果没有处理好 content-encoding，这里将会因为 requestHandler timeout 挂起！
      requestHandlerTimeoutSecs: 5, // 设置短一点方便测试失败
      requestHandler: async ({ page }) => {
        await page.waitForFunction(() => (window as any).data !== undefined, { timeout: 3000 });
        extractedData = await page.evaluate(() => (window as any).data);
      },
    }, new Configuration({
      storageClientOptions: { localDataDirectory: path.join(ctx.storagePath, 'gzip-cold') },
    }));

    await crawler.run([`${server.address}/index.html`]);
    await awaitCache();

    expect(extractedData).toBeDefined();
    expect(extractedData.message).toBe('Success from compressed data');

    // 验证 POST 请求确实被抓取（到达了服务器）
    const postRequest = server.requests.find(r => r.url === '/api/data' && r.method === 'POST');
    expect(postRequest).toBeDefined();
    // 验证 route.fetch() 完美地保留并透传了原始的 POST body
    expect(postRequest?.body).toEqual(JSON.stringify({ ping: true }));
  });

  it('Issue 2: Should not deadlock on warm start during background update (stale) for POST request', async () => {
    // 验证有 cache 且需要后台静默更新时的情况 (Warm Start with backgroundUpdate)
    const { server, cache, config, activeCacheWrites, awaitCache } = ctx;

    let callCount = 0;
    server.setHandler('/api/stale-data', (req, res) => {
      if (req.method !== 'POST') {
        res.status(405).send();
        return;
      }
      callCount++;
      res.header('Content-Type', 'application/json');
      // SWR: 1秒后过期，允许静默更新
      res.header('Cache-Control', 'public, max-age=1, stale-while-revalidate=60');
      res.send({ callCount, id: (req.body as any).id });
    });

    server.setHandler('/index.html', (req, res) => {
      res.header('Content-Type', 'text/html');
      res.send(`
        <html><body><script>
          fetch("/api/stale-data", {
            method: "POST",
            body: JSON.stringify({ id: 99 }),
            headers: { "content-type": "application/json" }
          })
          .then(r => r.json())
          .then(d => window.data = d)
        </script></body></html>
      `);
    });

    const hook = createCrawleeCacheHook({
      cache,
      config,
      activeCacheWrites,
      navigationOnly: false,
      backgroundUpdate: true // 开启后台更新以触发潜在死锁路径
    });

    // 1. Cold start
    const crawler1 = new PlaywrightCrawler({
      launchContext: { launchOptions: { headless: true } },
      preNavigationHooks: [hook],
      requestHandler: async ({ page }) => {
        await page.waitForFunction(() => (window as any).data !== undefined);
      },
    }, new Configuration({
      storageClientOptions: { localDataDirectory: path.join(ctx.storagePath, 'stale-run1') },
    }));
    await crawler1.run([`${server.address}/index.html`]);
    await awaitCache();
    expect(callCount).toBe(1);

    // 等待 1.5 秒让缓存过期 (变成 STALE)
    await new Promise(resolve => setTimeout(resolve, 1500));

    // 2. Warm start (STALE) -> should trigger background update
    let extractedDataRun2: any;
    const crawler2 = new PlaywrightCrawler({
      launchContext: { launchOptions: { headless: true } },
      preNavigationHooks: [hook],
      requestHandlerTimeoutSecs: 5, // 如果 backgroundUpdate 死锁了 Playwright 内部，这里可能会超时
      requestHandler: async ({ page }) => {
        await page.waitForFunction(() => (window as any).data !== undefined, { timeout: 3000 });
        extractedDataRun2 = await page.evaluate(() => (window as any).data);
      },
    }, new Configuration({
      storageClientOptions: { localDataDirectory: path.join(ctx.storagePath, 'stale-run2') },
    }));

    await crawler2.run([`${server.address}/index.html`]);
    await awaitCache();

    // 因为是 STALE 返回的，页面拿到的依然是旧数据 1
    expect(extractedDataRun2.callCount).toBe(1);
    expect(extractedDataRun2.id).toBe(99);
    // 但后台静默更新已经完成，API 会被调用第 2 次
    expect(callCount).toBe(2);

    // 验证后台更新所发送的 POST 请求的 body 是否完整保留且到达了 Mock 服务器
    const postRequests = server.requests.filter(r => r.url === '/api/stale-data' && r.method === 'POST');
    expect(postRequests.length).toBe(2);
    expect(postRequests[0].body).toEqual({ id: 99 });
    expect(postRequests[1].body).toEqual({ id: 99 });
  });
});
