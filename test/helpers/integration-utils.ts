import { SmartCache, SiteCacheConfig } from '@isdk/proxy';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { TestServer, createTestServer, TestServerOptions } from './test-server';

export interface IntegrationTestContext {
  cache: SmartCache;
  storagePath: string;
  activeCacheWrites: Map<string, Promise<void>>;
  server: TestServer;
  config: SiteCacheConfig;
  awaitCache: () => Promise<void>;
  cleanup: () => Promise<void>;
}

export async function setupIntegrationContext(options: { 
  serverOptions?: TestServerOptions;
  cacheConfig?: any;
} = {}): Promise<IntegrationTestContext> {
  const storagePath = path.join(os.tmpdir(), `proxy-crawlee-int-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const cache = new SmartCache({ storagePath });
  const activeCacheWrites = new Map<string, Promise<void>>();
  const server = await createTestServer(options.serverOptions);
  
  const config = options.cacheConfig || {
    methods: ['GET', 'POST'],
    forceCache: true,
    ttl: 60,
    staleWhileRevalidate: 30,
    staleIfError: 60,
  };

  return {
    cache,
    storagePath,
    activeCacheWrites,
    server,
    config,
    awaitCache: async () => {
      // Wait for all background cache writes to complete
      await Promise.all(Array.from(activeCacheWrites.values()));
    },
    cleanup: async () => {
      await server.close();
      await cache.clear();
      if (fs.existsSync(storagePath)) {
        try {
          fs.rmSync(storagePath, { recursive: true, force: true });
        } catch (e) {
          console.warn(`Failed to cleanup storagePath: ${storagePath}`, e);
        }
      }
    }
  };
}
