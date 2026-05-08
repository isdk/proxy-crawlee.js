import { describe, it, expect } from 'vitest';
import { crawleeToWebRequest } from './crawleeToWebRequest';

describe('crawleeToWebRequest', () => {
  it('应该正确转换基础的 GET 请求', () => {
    const crawleeReq = {
      url: 'https://example.com/api',
      method: 'GET',
      headers: { 'X-Test': 'val' }
    };
    const req = crawleeToWebRequest(crawleeReq);

    expect(req.url).toBe('https://example.com/api');
    expect(req.method).toBe('GET');
    expect(req.headers.get('x-test')).toBe('val');
  });

  it('应该正确转换带 Payload 的 POST 请求', async () => {
    const payload = JSON.stringify({ foo: 'bar' });
    const crawleeReq = {
      url: 'https://example.com/post',
      method: 'POST',
      payload,
      headers: { 'Content-Type': 'application/json' }
    };
    const req = crawleeToWebRequest(crawleeReq);

    expect(req.method).toBe('POST');
    expect(await req.text()).toBe(payload);
  });

  it('应该支持对象格式的 payload', async () => {
    const payload = { data: 123 };
    const crawleeReq = {
      url: 'https://example.com/json',
      method: 'POST',
      payload
    };
    const req = crawleeToWebRequest(crawleeReq);
    expect(await req.json()).toEqual(payload);
  });

  it('当 payload 为空时，不应设置 body', () => {
    const crawleeReq = {
      url: 'https://example.com/empty',
      method: 'POST',
      payload: null
    };
    const req = crawleeToWebRequest(crawleeReq);
    expect(req.body).toBeNull();
  });

  it('应该正确保留原始 Headers 的大小写敏感性（由 Request 处理）', () => {
    const crawleeReq = {
      url: 'https://example.com/headers',
      method: 'GET',
      headers: { 'X-Custom-Header': 'test-value' }
    };
    const req = crawleeToWebRequest(crawleeReq);
    expect(req.headers.get('x-custom-header')).toBe('test-value');
  });
});
