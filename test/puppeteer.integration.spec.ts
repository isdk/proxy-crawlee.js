import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PuppeteerCrawler, Configuration } from 'crawlee';
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
    }, new Configuration({
      storageClientOptions: {
        localDataDirectory: ctx.storagePath,
      },
    }));

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
    }, new Configuration({
      storageClientOptions: {
        localDataDirectory: ctx.storagePath,
      },
    }));

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

  it('should cache all assets when navigationOnly is false', async () => {
    const { server, cache, config, activeCacheWrites, awaitCache } = ctx;

    server.setHandler('/index.html', (req, res) => {
      res.header('Content-Type', 'text/html');
      res.header('Cache-Control', 'public, max-age=60');
      res.send('<html><body><script src="/script.js"></script></body></html>');
    });

    server.setHandler('/script.js', (req, res) => {
      res.header('Content-Type', 'application/javascript');
      res.header('Cache-Control', 'public, max-age=60');
      res.send('console.log("test")');
    });

    const hook = createCrawleeCacheHook({
      cache,
      config,
      activeCacheWrites,
      navigationOnly: false
    });

    const crawler = new PuppeteerCrawler({
      launchContext: { launchOptions: { headless: true } },
      preNavigationHooks: [hook],
      requestHandler: async () => {},
    }, new Configuration({
      storageClientOptions: {
        localDataDirectory: ctx.storagePath,
      },
    }));

    // First run
    await crawler.run([`${server.address}/index.html`]);
    await awaitCache();
    expect(server.requests.some(r => r.url === '/index.html')).toBe(true);
    expect(server.requests.some(r => r.url === '/script.js')).toBe(true);

    // Second run
    server.clear();
    await crawler.run([`${server.address}/index.html`]);

    // Both should be HIT
    expect(server.requests.some(r => r.url === '/index.html')).toBe(false);
    expect(server.requests.some(r => r.url === '/script.js')).toBe(false);
  });

  it('should fallback to network if fetcher fails', async () => {
    const { server, cache, config, activeCacheWrites } = ctx;

    server.setHandler('/fail', (req, res) => {
      res.header('Content-Type', 'text/html');
      res.send('<html><body>Fallback Success</body></html>');
    });

    const hook = createCrawleeCacheHook({
      cache,
      config,
      activeCacheWrites,
      fetcher: async () => {
        throw new Error('Fetcher error');
      }
    });

    const crawler = new PuppeteerCrawler({
      launchContext: { launchOptions: { headless: true } },
      preNavigationHooks: [hook],
      requestHandler: async ({ page }) => {
        const content = await page.content();
        expect(content).toContain('Fallback Success');
      },
    }, new Configuration({
      storageClientOptions: {
        localDataDirectory: ctx.storagePath,
      },
    }));

    await crawler.run([`${server.address}/fail`]);
    expect(server.requests.some(r => r.url === '/fail')).toBe(true);
  });
});
