/**
 * 内部工具：标准 Web 响应转 Got 兼容对象
 * (用于拦截器从缓存返回模拟数据)
 */
export async function webResponseToGotResponse(webRes: Response): Promise<any> {
  const body = await webRes.arrayBuffer();
  const headers: Record<string, string> = {};
  webRes.headers.forEach((v, k) => {
    headers[k] = v;
  });

  return {
    statusCode: webRes.status,
    headers,
    body: Buffer.from(body),
    rawBody: Buffer.from(body),
    // 注入自定义属性以便调试
    isFromCache: !!webRes.headers.get('x-proxy-cache') && webRes.headers.get('x-proxy-cache') !== 'MISS',
  };
}
