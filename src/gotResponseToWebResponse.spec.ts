import { describe, it, expect } from 'vitest';
import { gotResponseToWebResponse } from './gotResponseToWebResponse';

describe('gotResponseToWebResponse', () => {
  it('应该正确转换 Got 响应对象', async () => {
    const gotRes = {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: Buffer.from('{"ok":true}'),
      rawBody: Buffer.from('{"ok":true}')
    };

    const res = gotResponseToWebResponse(gotRes);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(await res.json()).toEqual({ ok: true });
  });
});
