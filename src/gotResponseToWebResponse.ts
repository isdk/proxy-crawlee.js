import { Readable } from 'node:stream';
import { createResponse } from '@isdk/proxy';

/**
 * 内部工具：Got 响应转标准 Web 响应
 */
export function gotResponseToWebResponse(gotRes: any): Response {
  let body: any = gotRes.rawBody || gotRes.body;

  // 如果是流式响应且 body 为空，则转换流
  if (!body && gotRes.on && typeof gotRes.pipe === 'function') {
    body = Readable.toWeb(gotRes);
  }

  const headers = new Headers();
  if (gotRes.headers) {
    for (const [key, value] of Object.entries(gotRes.headers)) {
      // skip HTTP/2 pseudo-headers
      if (key.startsWith(':')) { continue }
      if (Array.isArray(value)) {
        value.forEach(v => headers.append(key, v));
      } else if (value !== undefined && value !== null) {
        headers.set(key, String(value));
      }
    }
  } else if (Array.isArray(gotRes.rawHeaders)) {
    // https://github.com/apify/crawlee/blob/d3a29d9623bfd3b9b75c496a1c48134532c824e5/packages/core/src/http_clients/got-scraping-http-client.ts#L36
    // 因为返回结果中 `{...gotResult}`, 无法传出非枚举的headers属性！所以只有 rawHeaders ! 我就不明白为啥它不直接返回gotResult,非要这么搞！
    parseHeaders(gotRes.rawHeaders, headers);
  }

  const res = createResponse(body, {
    status: gotRes.statusCode || 200,
    statusText: gotRes.statusMessage,
    headers,
    url: gotRes.url,
  });

  return res;
}

/**
 * 将 rawHeaders 数组转换并填充到 Headers 实例中
 * @param rawHeaders Node.js 的一维头部数组 [key, val, key, val...]
 * @param existingHeaders 可选的现有 Headers 实例
 */
function parseHeaders(rawHeaders: string[] | undefined, existingHeaders?: Headers): Headers {
    if (!existingHeaders) existingHeaders = new Headers();

    if (!rawHeaders || !Array.isArray(rawHeaders)) {
        return existingHeaders;
    }

    // 步长为 2 遍历数组
    for (let i = 0; i < rawHeaders.length; i += 2) {
        const key = rawHeaders[i];
        // skip HTTP/2 pseudo-headers
        if (key.startsWith(':')) { continue }
        const value = rawHeaders[i + 1];

        // 使用 append 确保多次出现的相同 Key（如 set-cookie）不会被覆盖，而是合法追加
        existingHeaders.append(key, value);
    }

    return existingHeaders;
}
