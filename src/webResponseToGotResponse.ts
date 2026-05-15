import { Readable } from 'node:stream';

/**
 * 内部工具：标准 Web 响应转 Got 兼容对象
 * (用于拦截器从缓存返回模拟数据)
 */
export async function webResponseToGotResponse(webRes: Response): Promise<any> {
  const buffer = Buffer.from(await webRes.arrayBuffer());
  const headers: Record<string, string> = {};
  webRes.headers.forEach((v, k) => {
    headers[k] = v;
  });

  // 构造一个可读流
  const stream = Readable.from(buffer);

  // 将 Got 响应所需的属性附加到流对象上
  Object.assign(stream, {
    url: webRes.url,
    statusCode: webRes.status,
    statusMessage: webRes.statusText,
    headers,
    body: buffer,
    rawBody: buffer,
    // 命中缓存：HIT, OFFLINE_HIT, STALE, STALE_IF_ERROR, STALE_RESCUE_*
    isFromCache: /^(HIT|OFFLINE_HIT|STALE)/.test(webRes.headers.get('x-proxy-cache') || ''),
    cache: webRes.headers.get('x-proxy-cache'),
  });

  return stream;
}
