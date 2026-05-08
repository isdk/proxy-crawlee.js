/**
 * 将 Crawlee 的 Request 对象转换为标准的 Web Request
 */
export function crawleeToWebRequest(request: any): Request {
  const { url, method, headers, payload } = request;
  
  const options: RequestInit = {
    method: method || 'GET',
    headers: headers || {},
  };

  if (payload && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    options.body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  }

  return new Request(url, options);
}
