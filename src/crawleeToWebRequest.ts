/**
 * 将 Crawlee 的 Request 对象或浏览器 (Playwright) 的 Request 对象转换为标准的 Web Request
 */
export function crawleeToWebRequest(request: any): Request {
  const url = typeof request.url === 'function' ? request.url() : request.url;
  const method = typeof request.method === 'function' ? request.method() : request.method;
  const headers = typeof request.headers === 'function' ? request.headers() : request.headers;
  const payload = typeof request.postData === 'function' ? request.postData() : (request.payload || request.postData || request.body);
  
  const options: RequestInit = {
    method: method || 'GET',
    headers: headers || {},
  };

  if (payload && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    if (typeof payload === 'string' || payload instanceof Buffer || payload instanceof Uint8Array) {
      options.body = payload;
    } else {
      options.body = JSON.stringify(payload);
    }
  }

  return new Request(url, options);
}
