[**@isdk/proxy-crawlee**](../README.md)

***

[@isdk/proxy-crawlee](../globals.md) / setupHttpCrawlerCache

# Function: setupHttpCrawlerCache()

> **setupHttpCrawlerCache**(`crawler`, `options`, `fetchWithCacheBound`): `void`

Defined in: [proxy-crawlee/src/setupHttpCrawlerCache.ts:15](https://github.com/isdk/proxy-crawlee.js/blob/70a84cf65b1c2e2ebbe6bc6887e30e49f3ba1230/src/setupHttpCrawlerCache.ts#L15)

专门针对 HttpCrawler (CheerioCrawler) 的缓存设置函数。
通过劫持 crawler._requestFunction 实现最底层的拦截，
确保所有导航和手动请求都能正确处理缓存。

## Parameters

### crawler

`any`

### options

[`CrawleeCacheOptions`](../interfaces/CrawleeCacheOptions.md)

### fetchWithCacheBound

`any`

## Returns

`void`
