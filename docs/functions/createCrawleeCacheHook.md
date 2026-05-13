[**@isdk/proxy-crawlee**](../README.md)

***

[@isdk/proxy-crawlee](../globals.md) / createCrawleeCacheHook

# Function: createCrawleeCacheHook()

> **createCrawleeCacheHook**(`options`): (`context`, `secondArg?`) => `Promise`\<`void`\>

Defined in: [createCrawleeCacheHook.ts:20](https://github.com/isdk/proxy-crawlee.js/blob/e4dc2edc321b769a5d2322f1c502e87ea69353df/src/createCrawleeCacheHook.ts#L20)

创建一个通用的 Crawlee 缓存钩子，可用于 preNavigationHooks。

该钩子实现了“环境自适应”：
1. 如果检测到 Playwright 环境，会自动设置请求路由拦截。
2. 如果检测到 HTTP 环境 (CheerioCrawler)，会自动调用 setupHttpCrawlerCache。

## Parameters

### options

[`CrawleeCacheOptions`](../interfaces/CrawleeCacheOptions.md)

## Returns

> (`context`, `secondArg?`): `Promise`\<`void`\>

### Parameters

#### context

[`CrawleeContext`](../interfaces/CrawleeContext.md)

#### secondArg?

`any`

### Returns

`Promise`\<`void`\>
