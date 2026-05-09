import { Readable } from 'node:stream';

/**
 * 内部工具：Got 响应转标准 Web 响应
 */
export function gotResponseToWebResponse(gotRes: any): Response {
  let body: any = gotRes.rawBody || gotRes.body;

  // 如果是流式响应且 body 为空，则转换流
  if (!body && gotRes.on && typeof gotRes.pipe === 'function') {
    body = Readable.toWeb(gotRes);
  }

  const res = new Response(body, {
    status: gotRes.statusCode,
    statusText: gotRes.statusMessage,
    headers: gotRes.headers as any,
  });

  // 关键：注入 URL，因为 Response 构造函数无法直接设置它
  if (gotRes.url) {
    Object.defineProperty(res, 'url', { value: gotRes.url });
  }

  return res;
}

