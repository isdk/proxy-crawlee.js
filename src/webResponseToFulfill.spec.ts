import { describe, it, expect } from 'vitest';
import { webResponseToFulfill } from './webResponseToFulfill';

describe('webResponseToFulfill', () => {
  it('应该将标准 Response 转换为浏览器兼容的 Fulfill 选项', async () => {
    const response = new Response('hello world', {
      status: 201,
      headers: { 'X-Cache': 'HIT', 'Content-Type': 'text/plain' }
    });

    const result = await webResponseToFulfill(response);

    expect(result.status).toBe(201);
    expect(result.headers['x-cache']).toBe('HIT');
    expect(result.headers['content-type']).toBe('text/plain');
    expect(result.body.toString()).toBe('hello world');
    expect(Buffer.isBuffer(result.body)).toBe(true);
  });
});
