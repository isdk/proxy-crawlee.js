import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PlaywrightCrawler, Configuration } from 'crawlee';
import path from 'path';
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

    const crawlerOptions = {
      launchContext: { launchOptions: { headless: true } },
      preNavigationHooks: [hook],
      requestHandler: async ({ response }: any) => {
        x_proxy_caches.push(response?.headers()['x-proxy-cache'] as string);
        // Just wait a bit to ensure script would have been loaded
        await new Promise(r => setTimeout(r, 500));
      },
    };

    // First run: MISS for html
    const crawler1 = new PlaywrightCrawler(crawlerOptions, new Configuration({
      storageClientOptions: { localDataDirectory: path.join(ctx.storagePath, 'nav-1') },
    }));
    await crawler1.run([`${server.address}/index.html`]);
    expect(server.requests.some(r => r.url === '/index.html')).toBe(true);
    expect(server.requests.some(r => r.url === '/script.js')).toBe(true);
    await awaitCache();

    // Second run: HIT for html, script should STILL be fetched from server (navigationOnly: true)
    server.clear();
    const crawler2 = new PlaywrightCrawler(crawlerOptions, new Configuration({
      storageClientOptions: { localDataDirectory: path.join(ctx.storagePath, 'nav-2') },
    }));
    await crawler2.run([`${server.address}/index.html`]);

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

    const crawlerOptions = {
      launchContext: { launchOptions: { headless: true } },
      preNavigationHooks: [hook],
      requestHandler: async ({ response }: any) => {
        x_proxy_caches.push(response?.headers()['x-proxy-cache'] as string);
      },
    };

    // First run
    const crawler1 = new PlaywrightCrawler(crawlerOptions, new Configuration({
      storageClientOptions: { localDataDirectory: path.join(ctx.storagePath, 'all-1') },
    }));
    await crawler1.run([`${server.address}/index.html`]);
    await awaitCache();

    // Second run
    server.clear();
    const crawler2 = new PlaywrightCrawler(crawlerOptions, new Configuration({
      storageClientOptions: { localDataDirectory: path.join(ctx.storagePath, 'all-2') },
    }));
    await crawler2.run([`${server.address}/index.html`]);

    // Both should be HIT (but requestHandler only sees the main document response)
    expect(server.requests.some(r => r.url === '/index.html')).toBe(false);
    expect(server.requests.some(r => r.url === '/script.js')).toBe(false);
    expect(x_proxy_caches).toStrictEqual(['MISS', 'HIT']);
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

    const crawler = new PlaywrightCrawler({
      launchContext: { launchOptions: { headless: true } },
      preNavigationHooks: [hook],
      requestHandler: async ({ page }) => {
        const content = await page.content();
        expect(content).toContain('Fallback Success');
      },
    }, new Configuration({
      storageClientOptions: {
        localDataDirectory: path.join(ctx.storagePath, 'fail-1'),
      },
    }));

    await crawler.run([`${server.address}/fail`]);
    expect(server.requests.some(r => r.url === '/fail')).toBe(true);
  });

  it('should handle multiple sequential navigations correctly', async () => {
    const { server, cache, config, activeCacheWrites, awaitCache } = ctx;

    server.setHandler('/page1', (req, res) => {
      res.header('Content-Type', 'text/html');
      res.header('Cache-Control', 'public, max-age=60');
      res.send('<html><body>Page 1</body></html>');
    });

    server.setHandler('/page2', (req, res) => {
      res.header('Content-Type', 'text/html');
      res.header('Cache-Control', 'public, max-age=60');
      res.send('<html><body>Page 2</body></html>');
    });

    const hook = createCrawleeCacheHook({
      cache,
      config,
      activeCacheWrites
    });

    const x_proxy_caches: string[] = []

    const crawlerOptions = {
      launchContext: { launchOptions: { headless: true } },
      preNavigationHooks: [hook],
      requestHandler: async ({ response }: any) => {
        x_proxy_caches.push(response?.headers()['x-proxy-cache'] as string);
      },
    };

    // Run both in one go
    const crawler1 = new PlaywrightCrawler(crawlerOptions, new Configuration({
      storageClientOptions: { localDataDirectory: path.join(ctx.storagePath, 'seq-1') },
    }));
    await crawler1.run([`${server.address}/page1`, `${server.address}/page2`]);
    await awaitCache();
    expect(x_proxy_caches).toStrictEqual(['MISS', 'MISS']);

    // Second run: both should HIT
    server.clear();
    x_proxy_caches.length = 0;
    const crawler2 = new PlaywrightCrawler(crawlerOptions, new Configuration({
      storageClientOptions: { localDataDirectory: path.join(ctx.storagePath, 'seq-2') },
    }));
    await crawler2.run([`${server.address}/page1`, `${server.address}/page2`]);
    expect(x_proxy_caches).toStrictEqual(['HIT', 'HIT']);
    expect(server.requests.length).toBe(0);
  });

  it('should cache XHR/Fetch requests when navigationOnly is false', async () => {
    const { server, cache, config, activeCacheWrites, awaitCache } = ctx;

    server.setHandler('/api/data', (req, res) => {
      res.header('Content-Type', 'application/json');
      res.header('Cache-Control', 'public, max-age=60');
      res.send({ status: 'ok' });
    });

    server.setHandler('/index.html', (req, res) => {
      res.header('Content-Type', 'text/html');
      res.send('<html><body><script>fetch("/api/data").then(r => r.json()).then(d => window.data = d)</script></body></html>');
    });

    const hook = createCrawleeCacheHook({
      cache,
      config,
      activeCacheWrites,
      navigationOnly: false
    });

    const crawlerOptions = {
      launchContext: { launchOptions: { headless: true } },
      preNavigationHooks: [hook],
      requestHandler: async ({ page }: any) => {
        // Wait for fetch to complete
        await page.waitForFunction(() => (window as any).data !== undefined);
        const data = await page.evaluate(() => (window as any).data);
        expect(data.status).toBe('ok');
      },
    };

    // First run
    const crawler1 = new PlaywrightCrawler(crawlerOptions, new Configuration({
      storageClientOptions: { localDataDirectory: path.join(ctx.storagePath, 'xhr-1') },
    }));
    await crawler1.run([`${server.address}/index.html`]);
    await awaitCache();
    expect(server.requests.some(r => r.url === '/api/data')).toBe(true);

    // Second run
    server.clear();
    const crawler2 = new PlaywrightCrawler(crawlerOptions, new Configuration({
      storageClientOptions: { localDataDirectory: path.join(ctx.storagePath, 'xhr-2') },
    }));
    await crawler2.run([`${server.address}/index.html`]);
    expect(server.requests.some(r => r.url === '/api/data')).toBe(false);
  });

  it('should support SWR (Stale-While-Revalidate) for sub-resources', async () => {
    const { server, cache, config, activeCacheWrites, awaitCache } = ctx;

    let apiCalls = 0;
    server.setHandler('/api/swr', (req, res) => {
      apiCalls++;
      res.header('Content-Type', 'application/json');
      res.header('Cache-Control', 'public, max-age=1, stale-while-revalidate=60');
      res.send({ count: apiCalls });
    });

    server.setHandler('/index.html', (req, res) => {
      res.header('Content-Type', 'text/html');
      res.send('<html><body><script>fetch("/api/swr").then(r => r.json()).then(d => window.count = d.count)</script></body></html>');
    });

    const hook = createCrawleeCacheHook({
      cache,
      config,
      activeCacheWrites,
      navigationOnly: false,
      backgroundUpdate: true
    });

    const requestHandler = async ({ page }: any) => {
      await page.waitForFunction(() => (window as any).count !== undefined);
    };

    // 1. First run: MISS
    const crawler1 = new PlaywrightCrawler({
      launchContext: { launchOptions: { headless: true } },
      preNavigationHooks: [hook],
      requestHandler,
    }, new Configuration({
      storageClientOptions: { localDataDirectory: path.join(ctx.storagePath, 'swr-sub-1') },
    }));
    await crawler1.run([`${server.address}/index.html`]);
    await awaitCache();
    expect(apiCalls).toBe(1);

    // 2. Wait for max-age to expire
    await new Promise(r => setTimeout(r, 1200));

    // 3. Second run: Should return STALE (count 1) and trigger background update
    const crawler2 = new PlaywrightCrawler({
      launchContext: { launchOptions: { headless: true } },
      preNavigationHooks: [hook],
      requestHandler,
    }, new Configuration({
      storageClientOptions: { localDataDirectory: path.join(ctx.storagePath, 'swr-sub-2') },
    }));
    await crawler2.run([`${server.address}/index.html`]);
    
    await awaitCache(); // Wait for background update
    expect(apiCalls).toBe(2); // One for first run, one for background revalidation

    // 4. Third run: Should be HIT with new data (count 2)
    const counts: number[] = [];
    const crawler3 = new PlaywrightCrawler({
        launchContext: { launchOptions: { headless: true } },
        preNavigationHooks: [hook],
        requestHandler: async ({ page }) => {
          await page.waitForFunction(() => (window as any).count !== undefined);
          counts.push(await page.evaluate(() => (window as any).count));
        },
      }, new Configuration({
      storageClientOptions: { localDataDirectory: path.join(ctx.storagePath, 'swr-sub-3') },
    }));

    await crawler3.run([`${server.address}/index.html`]);
    expect(counts[0]).toBe(2);
    expect(apiCalls).toBe(2); // No new server call
  });

  it('should cache POST fetch requests based on body', async () => {
    const { server, cache, config, activeCacheWrites, awaitCache } = ctx;

    server.setHandler('/api/post', (req, res) => {
      res.header('Content-Type', 'application/json');
      res.header('Cache-Control', 'public, max-age=60');
      res.send({ id: (req.body as any).id });
    });

    server.setHandler('/index.html', (req, res) => {
      res.header('Content-Type', 'text/html');
      res.send(`
        <html><body><script>
          window.doPost = (id) => fetch("/api/post", {
            method: "POST",
            body: JSON.stringify({ id }),
            headers: { "content-type": "application/json" }
          }).then(r => r.json());
        </script></body></html>
      `);
    });

    const hook = createCrawleeCacheHook({
      cache,
      config,
      activeCacheWrites,
      navigationOnly: false
    });

    const requestHandler = async ({ page }: any) => {
      const res1 = await page.evaluate(() => (window as any).doPost(1));
      const res2 = await page.evaluate(() => (window as any).doPost(2));
      const res3 = await page.evaluate(() => (window as any).doPost(1)); // Should HIT

      expect(res1.id).toBe(1);
      expect(res2.id).toBe(2);
      expect(res3.id).toBe(1);
    };

    const crawler1 = new PlaywrightCrawler({
      launchContext: { launchOptions: { headless: true } },
      preNavigationHooks: [hook],
      requestHandler,
    }, new Configuration({
      storageClientOptions: { localDataDirectory: path.join(ctx.storagePath, 'post-p1') },
    }));

    await crawler1.run([`${server.address}/index.html`]);
    await awaitCache();

    // Verify server received 2 unique POSTs
    const postRequests = server.requests.filter(r => r.url === '/api/post');
    expect(postRequests.length).toBe(2);
  });

  it('should handle redirects correctly', async () => {
    const { server, cache, config, activeCacheWrites, awaitCache } = ctx;

    server.setHandler('/old-path', (req, res) => {
      res.status(301).header('Location', '/new-path').send();
    });

    server.setHandler('/new-path', (req, res) => {
      res.header('Content-Type', 'text/html');
      res.header('Cache-Control', 'public, max-age=60');
      res.send('<html><body>Redirected Content</body></html>');
    });

    const hook = createCrawleeCacheHook({
      cache,
      config,
      activeCacheWrites
    });

    const requestHandler = async ({ page, response }: any) => {
      expect(response?.url()).toContain('/new-path');
      expect(await page.content()).toContain('Redirected Content');
    };

    // First run: MISS
    const crawler1 = new PlaywrightCrawler({
      launchContext: { launchOptions: { headless: true } },
      preNavigationHooks: [hook],
      requestHandler,
    }, new Configuration({
      storageClientOptions: { localDataDirectory: path.join(ctx.storagePath, 'red-1') },
    }));
    await crawler1.run([`${server.address}/old-path`]);
    await awaitCache();
    expect(server.requests.some(r => r.url === '/old-path')).toBe(true);
    expect(server.requests.some(r => r.url === '/new-path')).toBe(true);

    // Second run: HIT for both (or at least the final one)
    server.clear();
    const crawler2 = new PlaywrightCrawler({
      launchContext: { launchOptions: { headless: true } },
      preNavigationHooks: [hook],
      requestHandler,
    }, new Configuration({
      storageClientOptions: { localDataDirectory: path.join(ctx.storagePath, 'red-2') },
    }));
    await crawler2.run([`${server.address}/old-path`]);
    expect(server.requests.length).toBe(0);
  });

  it('should preserve cookies when using route.fetch()', async () => {
    const { server, cache, config, activeCacheWrites, awaitCache } = ctx;

    server.setHandler('/set-cookie', (req, res) => {
      res.header('Set-Cookie', 'test-cookie=proxy-crawlee; Path=/; HttpOnly');
      res.header('Content-Type', 'text/html');
      res.send('<html><body>Cookie Set<script>fetch("/check-cookie").then(r => r.text()).then(t => window.cookieVal = t)</script></body></html>');
    });

    server.setHandler('/check-cookie', (req, res) => {
      const cookie = req.headers['cookie'];
      res.send(cookie || 'no-cookie');
    });

    const hook = createCrawleeCacheHook({
      cache,
      config,
      activeCacheWrites,
      navigationOnly: false // Need to intercept the fetch call
    });

    const crawler = new PlaywrightCrawler({
      launchContext: { launchOptions: { headless: true } },
      preNavigationHooks: [hook],
      requestHandler: async ({ page }) => {
        await page.waitForFunction(() => (window as any).cookieVal !== undefined);
        const cookieVal = await page.evaluate(() => (window as any).cookieVal);
        expect(cookieVal).toContain('test-cookie=proxy-crawlee');
      },
    }, new Configuration({
      storageClientOptions: {
        localDataDirectory: path.join(ctx.storagePath, 'cookie-1'),
      },
    }));

    await crawler.run([`${server.address}/set-cookie`]);
  });

  it('should cache multiple calls in the same session via page.goto', async () => {
    const { server, cache, config, activeCacheWrites, awaitCache } = ctx;

    server.setHandler('/page-a', (req, res) => {
      res.header('Content-Type', 'text/html');
      res.header('Cache-Control', 'public, max-age=60');
      res.header('Date', new Date().toUTCString());
      res.send('<html><body><h1>Page A</h1></body></html>');
    });

    server.setHandler('/page-b', (req, res) => {
      res.header('Content-Type', 'text/html');
      res.header('Cache-Control', 'public, max-age=60');
      res.header('Date', new Date().toUTCString());
      res.send('<html><body><h1>Page B</h1></body></html>');
    });

    const hook = createCrawleeCacheHook({ 
      cache, 
      config, 
      activeCacheWrites,
      backgroundUpdate: false
    });
    const results: any[] = [];

    const requestHandler = async ({ page, response, request }: any) => {
      if (request.url.endsWith('/page-a')) {
        const cacheA = response?.headers()['x-proxy-cache'];

        // Manual navigation to page-b
        const responseB = await page.goto(`${server.address}/page-b`);
        const cacheB = responseB?.headers()['x-proxy-cache'];

        results.push({ cacheA, cacheB });
      }
    };

    const crawlerConfig1 = new Configuration({
      persistStorage: false,
      storageClientOptions: { localDataDirectory: path.join(ctx.storagePath, 'p-multi-1') },
    });

    const crawler1 = new PlaywrightCrawler({
      launchContext: { launchOptions: { headless: true } },
      preNavigationHooks: [hook],
      requestHandler,
    }, crawlerConfig1);

    // First run
    await crawler1.run([`${server.address}/page-a`]);
    await awaitCache();

    // Second run
    const crawlerConfig2 = new Configuration({
      persistStorage: false,
      storageClientOptions: { localDataDirectory: path.join(ctx.storagePath, 'p-multi-2') },
    });

    const crawler2 = new PlaywrightCrawler({
      launchContext: { launchOptions: { headless: true } },
      preNavigationHooks: [hook],
      requestHandler,
    }, crawlerConfig2);
    await crawler2.run([`${server.address}/page-a`]);

    expect(results).toHaveLength(2);
    expect(results[0].cacheA).toBe('MISS');
    expect(results[0].cacheB).toBe('MISS');
    expect(results[1].cacheA).toBe('HIT');
    expect(results[1].cacheB).toBe('HIT');

    expect(server.requests.filter(r => r.url === '/page-a')).toHaveLength(1);
    expect(server.requests.filter(r => r.url === '/page-b')).toHaveLength(1);
  });
});
