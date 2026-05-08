/**
 * 将 Web 标准 Response 转换为浏览器 Fulfill 选项 (兼容 Playwright/Puppeteer)
 */
export async function webResponseToFulfill(response: Response) {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  return {
    status: response.status,
    headers,
    body: Buffer.from(await response.arrayBuffer()),
  };
}
