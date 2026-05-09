import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PlaywrightCrawler } from 'crawlee';
import { createCrawleeCacheHook } from '../src/createCrawleeCacheHook';
import { setupIntegrationContext, IntegrationTestContext } from './helpers/integration-utils';

describe('PlaywrightCrawler Integration', () => {
  let ctx: IntegrationTestContext;

  beforeEach(async () => {
    ctx = await setupIntegrationContext();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it('should cache navigation requests and skip static assets by default', async () => {
    const { server, cache, config, activeCacheWrites, awaitCache } = ctx;

    server.setHandler('/index.html', (req, res) => {
      res.header('Content-Type', 'text/html');
      res.header('Cache-Control', 'public, max-age=60');
      res.send('<html><body><h1>Hello</h1><script src="/script.js"></script></body></html>');
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
      navigationOnly: true // Default
    });

    const x_proxy_caches: string[] = []

    const crawler = new PlaywrightCrawler({
      launchContext: { launchOptions: { headless: true } },
      preNavigationHooks: [hook],
      requestHandler: async ({ response }) => {
        x_proxy_caches.push(response?.headers()['x-proxy-cache'] as string);
        // Just wait a bit to ensure script would have been loaded
        await new Promise(r => setTimeout(r, 500));
      },
    });

    // First run: MISS for html, script should be fetched normally
    await crawler.run([`${server.address}/index.html`]);
    expect(server.requests.some(r => r.url === '/index.html')).toBe(true);
    expect(server.requests.some(r => r.url === '/script.js')).toBe(true);
    await awaitCache();

    // Second run: HIT for html, script should STILL be fetched from server (navigationOnly: true)
    server.clear();
    await crawler.run([`${server.address}/index.html`]);

    expect(server.requests.some(r => r.url === '/index.html')).toBe(false);
    expect(server.requests.some(r => r.url === '/script.js')).toBe(true);
    expect(x_proxy_caches).toStrictEqual(['MISS', 'HIT']);
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

    const x_proxy_caches: string[] = []

    const crawler = new PlaywrightCrawler({
      launchContext: { launchOptions: { headless: true } },
      preNavigationHooks: [hook],
      requestHandler: async ({ response }) => {
        x_proxy_caches.push(response?.headers()['x-proxy-cache'] as string);
      },
    });

    // First run
    await crawler.run([`${server.address}/index.html`]);
    await awaitCache();

    // Second run
    server.clear();
    await crawler.run([`${server.address}/index.html`]);

    // Both should be HIT (but requestHandler only sees the main document response)
    expect(server.requests.some(r => r.url === '/index.html')).toBe(false);
    expect(server.requests.some(r => r.url === '/script.js')).toBe(false);
    expect(x_proxy_caches).toStrictEqual(['MISS', 'HIT']);
  });
});
