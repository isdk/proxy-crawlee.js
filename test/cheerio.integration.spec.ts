import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CheerioCrawler } from 'crawlee';
import { createCrawleeCacheHook } from '../src/createCrawleeCacheHook';
import { setupIntegrationContext, IntegrationTestContext } from './helpers/integration-utils';

describe('CheerioCrawler Integration', () => {
  let ctx: IntegrationTestContext;

  beforeEach(async () => {
    ctx = await setupIntegrationContext();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it('should cache and hit for standard GET requests', async () => {
    const { server, cache, config, activeCacheWrites, awaitCache } = ctx;

    server.setHandler('/hello', async (req, res) => {
      res.header('Cache-Control', 'public, max-age=60');
      return { message: 'hello world' };
    });

    const hook = createCrawleeCacheHook({
      cache,
      config,
      activeCacheWrites,
      backgroundUpdate: true
    });

    const x_proxy_caches: string[] = []
    const resDatas: string[] = []

    const crawler = new CheerioCrawler({
      preNavigationHooks: [hook],
      requestHandler: async ({ body, response }) => {
        try {
          const data = JSON.parse(body.toString());
          resDatas.push(data.message)
          x_proxy_caches.push(response.headers?.['x-proxy-cache'] as string)
        } catch (e) {
          console.error('RequestHandler failed:', e);
          throw e;
        }
      },
      failedRequestHandler: async ({ request, error }) => {
        console.error(`Request ${request.url} failed:`, error);
      }
    });

    // First request: MISS
    await crawler.run([`${server.address}/hello`]);
    expect(server.requests.length).toBe(1);

    await awaitCache(); // Ensure written to disk/cache

    // Second request: HIT
    await crawler.run([`${server.address}/hello`]);
    expect(server.requests.length).toBe(1); // Should not have reached server again
    expect(x_proxy_caches).toStrictEqual(['MISS', 'HIT'])
    expect(resDatas).toStrictEqual(['hello world', 'hello world'])
  });

  it('should support SWR (Stale-While-Revalidate)', async () => {
    const { server, cache, config, activeCacheWrites, awaitCache } = ctx;

    let callCount = 0;
    server.setHandler('/swr', async (req, res) => {
      callCount++;
      res.header('Cache-Control', 'public, max-age=1, stale-while-revalidate=60');
      return { count: callCount };
    });

    const hook = createCrawleeCacheHook({
      cache,
      config,
      activeCacheWrites,
      backgroundUpdate: true
    });

    const x_proxy_caches: string[] = []
    const counts: number[] = []

    const crawler = new CheerioCrawler({
      preNavigationHooks: [hook],
      requestHandler: async ({ body, response }) => {
        const data = JSON.parse(body.toString());
        counts.push(data.count);
        x_proxy_caches.push(response.headers?.['x-proxy-cache'] as string);
      },
    });

    // 1. First request: MISS
    await crawler.run([`${server.address}/swr`]);
    expect(server.requests.length).toBe(1);
    await awaitCache();

    // 2. Wait for max-age=1 to expire
    await new Promise(r => setTimeout(r, 1100));

    // 3. Second request: Should return STALE and trigger background update
    await crawler.run([`${server.address}/swr`]);

    await awaitCache(); // Ensure background update to finish
    expect(server.requests.length).toBe(2); // MISS(1) + Revalidate(1)

    // 4. Third request: Should be HIT with new data
    await crawler.run([`${server.address}/swr`]);
    expect(server.requests.length).toBe(2);

    expect(x_proxy_caches).toStrictEqual(['MISS', 'STALE', 'HIT']);
    expect(counts).toStrictEqual([1, 1, 2]);
  });

  it('should support binary data (images)', async () => {
    const { server, cache, config, activeCacheWrites, awaitCache } = ctx;
    const imageData = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]); // PNG header

    server.setHandler('/image.png', (req, res) => {
      res.header('Content-Type', 'image/png');
      res.header('Cache-Control', 'public, max-age=60');
      res.send(imageData);
    });

    const hook = createCrawleeCacheHook({ cache, config, activeCacheWrites });
    const x_proxy_caches: string[] = []
    const bodies: Buffer[] = []

    const crawler = new CheerioCrawler({
      additionalMimeTypes: ['image/png'], // Important: allow CheerioCrawler to process images
      preNavigationHooks: [hook],
      requestHandler: async ({ body, response }: any) => {
        bodies.push(body);
        x_proxy_caches.push(response.headers?.['x-proxy-cache'] as string);
      },
    });

    await crawler.run([`${server.address}/image.png`]);
    await awaitCache();
    await crawler.run([`${server.address}/image.png`]);

    expect(server.requests.length).toBe(1);
    expect(x_proxy_caches).toStrictEqual(['MISS', 'HIT']);
    expect(bodies[0]).toEqual(imageData);
    expect(bodies[1]).toEqual(imageData);
  });

  it('should support stale-if-error for resiliency', async () => {
    const { server, cache, config, activeCacheWrites, awaitCache } = ctx;
    let callCount = 0

    server.setHandler('/error-resiliency', async (req, res) => {
      callCount++;
      // Set SWR to 0 via header to ensure we test stale-if-error directly
      res.header('Cache-Control', 'public, max-age=1, stale-while-revalidate=0, stale-if-error=60');
      return { status: 'ok' };
    });

    const hook = createCrawleeCacheHook({
      cache,
      config,
      activeCacheWrites,
      backgroundUpdate: false // Important: disable background update to see STALE_IF_ERROR synchronously
    });

    const x_proxy_caches: string[] = []

    const crawler = new CheerioCrawler({
      preNavigationHooks: [hook],
      requestHandler: async ({ body, response }) => {
        const data = JSON.parse(body.toString());
        expect(data.status).toBe('ok');
        x_proxy_caches.push(response.headers?.['x-proxy-cache'] as string);
      },
    });

    // 1. Success first to populate cache
    await crawler.run([`${server.address}/error-resiliency`]);
    await awaitCache();

    // 2. Wait for max-age to expire
    await new Promise(r => setTimeout(r, 1200));

    // 3. Close the server to simulate total outage
    await server.close();

    // 4. Request should still succeed using stale cache via stale-if-error
    await crawler.run([`${server.address}/error-resiliency`]);

    expect(x_proxy_caches).toStrictEqual(['MISS', 'STALE_IF_ERROR']);
    expect(callCount).toBe(1);
  });

  it('should distinguish POST requests by their payload', async () => {
    const { server, cache, config, activeCacheWrites, awaitCache } = ctx;

    server.setHandler('/api/post', async (req, res) => {
      res.header('Cache-Control', 'public, max-age=60');
      return { id: (req.body as any).id };
    });

    const hook = createCrawleeCacheHook({ cache, config, activeCacheWrites });
    const x_proxy_caches: string[] = []
    const ids: number[] = []

    const crawler = new CheerioCrawler({
      preNavigationHooks: [hook],
      requestHandler: async ({ body, response }) => {
        const data = JSON.parse(body.toString());
        ids.push(data.id);
        x_proxy_caches.push(response.headers?.['x-proxy-cache'] as string);
      },
    });

    // Request with ID 1
    await crawler.run([{
      url: `${server.address}/api/post`,
      method: 'POST',
      payload: JSON.stringify({ id: 1 }),
      headers: { 'content-type': 'application/json' }
    }]);
    await awaitCache();
    expect(server.requests.length).toBe(1);

    // Request with ID 2 (different payload, same URL)
    await crawler.run([{
      url: `${server.address}/api/post`,
      method: 'POST',
      payload: JSON.stringify({ id: 2 }),
      headers: { 'content-type': 'application/json' }
    }]);
    await awaitCache();
    expect(server.requests.length).toBe(2); // Should be MISS again

    // Repeat Request with ID 1 (should HIT)
    await crawler.run([{
      url: `${server.address}/api/post`,
      method: 'POST',
      payload: JSON.stringify({ id: 1 }),
      headers: { 'content-type': 'application/json' }
    }]);

    expect(server.requests.length).toBe(2); // No new server request
    expect(x_proxy_caches).toStrictEqual(['MISS', 'MISS', 'HIT']);
    expect(ids).toStrictEqual([1, 2, 1]);
  });
});
