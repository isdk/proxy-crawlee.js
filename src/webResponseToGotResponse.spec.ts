import { describe, it, expect } from 'vitest';
import { webResponseToGotResponse } from './webResponseToGotResponse';

describe('webResponseToGotResponse', () => {
  it('应该将标准 Response 转换为 Got 兼容格式', async () => {
    const response = new Response('cached data', {
      status: 200,
      headers: { 'X-Proxy-Cache': 'HIT' }
    });

    const gotRes = await webResponseToGotResponse(response);

    expect(gotRes.statusCode).toBe(200);
    expect(gotRes.body.toString()).toBe('cached data');
    expect(gotRes.isFromCache).toBe(true);
    expect(gotRes.headers['x-proxy-cache']).toBe('HIT');
  });
});
