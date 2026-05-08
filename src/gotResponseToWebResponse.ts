/**
 * 内部工具：Got 响应转标准 Web 响应
 */
export function gotResponseToWebResponse(gotRes: any): Response {
  return new Response(gotRes.rawBody || gotRes.body, {
    status: gotRes.statusCode,
    headers: gotRes.headers as any,
  });
}
