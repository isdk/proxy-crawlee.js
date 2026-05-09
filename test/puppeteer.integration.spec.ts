import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PuppeteerCrawler } from 'crawlee';
import { createCrawleeCacheHook } from '../src/createCrawleeCacheHook';
import { setupIntegrationContext, IntegrationTestContext } from './helpers/integration-utils';

describe('PuppeteerCrawler Integration', () => {
  let ctx: IntegrationTestContext;

  beforeEach(async () => {
    ctx = await setupIntegrationContext();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it('should support Puppeteer request interception', async () => {
    const { server, cache, config, activeCacheWrites, awaitCache } = ctx;

    server.setHandler('/puppeteer', (req, res) => {
      res.header('Content-Type', 'text/html');
      res.header('Cache-Control', 'public, max-age=60');
      return '<html><body>Puppeteer Test</body></html>';
    });

    const hook = createCrawleeCacheHook({
      cache,
      config,
      activeCacheWrites
    });

    const x_proxy_caches: string[] = []

    const crawler = new PuppeteerCrawler({
      launchContext: { launchOptions: { headless: true } },
      preNavigationHooks: [hook],
      requestHandler: async ({ page, response }) => {
        const content = await page.content();
        expect(content).toContain('Puppeteer Test');
        x_proxy_caches.push(response?.headers()['x-proxy-cache'] as string);
      },
    });

    // First run: MISS
    await crawler.run([`${server.address}/puppeteer`]);
    expect(server.requests.length).toBe(1);
    await awaitCache();

    // Second run: HIT
    server.clear();
    await crawler.run([`${server.address}/puppeteer`]);
    expect(server.requests.length).toBe(0);
    expect(x_proxy_caches).toStrictEqual(['MISS', 'HIT']);
  });

  it('should handle POST requests with body fingerprinting', async () => {
    const { server, cache, config, activeCacheWrites, awaitCache } = ctx;

    server.setHandler('/post-api', (req, res) => {
      res.header('Cache-Control', 'public, max-age=60');
      return { received: req.body };
    });

    const hook = createCrawleeCacheHook({
      cache,
      config,
      activeCacheWrites
    });

    const x_proxy_caches: string[] = []

    const crawler = new PuppeteerCrawler({
      launchContext: { launchOptions: { headless: true } },
      preNavigationHooks: [hook],
      requestHandler: async ({ response }) => {
        x_proxy_caches.push(response?.headers()['x-proxy-cache'] as string);
      },
    });

    // 1. First POST request
    await crawler.run([{
        url: `${server.address}/post-api`,
        method: 'POST',
        payload: JSON.stringify({ id: 1 }),
        headers: { 'content-type': 'application/json' }
    }]);
    expect(server.requests.length).toBe(1);
    await awaitCache();

    // 2. Same POST request: should HIT
    server.clear();
    await crawler.run([{
        url: `${server.address}/post-api`,
        method: 'POST',
        payload: JSON.stringify({ id: 1 }),
        headers: { 'content-type': 'application/json' }
    }]);
    expect(server.requests.length).toBe(0);

    // 3. Different POST request: should MISS
    server.clear();
    await crawler.run([{
        url: `${server.address}/post-api`,
        method: 'POST',
        payload: JSON.stringify({ id: 2 }),
        headers: { 'content-type': 'application/json' }
    }]);
    expect(server.requests.length).toBe(1);
    expect(x_proxy_caches).toStrictEqual(['MISS', 'HIT', 'MISS']);
  });
});
