[**@isdk/proxy-crawlee**](../README.md)

***

[@isdk/proxy-crawlee](../globals.md) / CrawleeCacheOptions

# Interface: CrawleeCacheOptions

Defined in: [types.ts:6](https://github.com/isdk/proxy-crawlee.js/blob/be04cca1b979eb306ac7188ee39287f3a8d67fa6/src/types.ts#L6)

Crawlee 缓存适配器配置选项

## Properties

### activeCacheWrites?

> `optional` **activeCacheWrites**: `Map`\<`string`, `Promise`\<`void`\>\>

Defined in: [types.ts:24](https://github.com/isdk/proxy-crawlee.js/blob/be04cca1b979eb306ac7188ee39287f3a8d67fa6/src/types.ts#L24)

并发写入任务追踪器

***

### backgroundUpdate?

> `optional` **backgroundUpdate**: `boolean`

Defined in: [types.ts:17](https://github.com/isdk/proxy-crawlee.js/blob/be04cca1b979eb306ac7188ee39287f3a8d67fa6/src/types.ts#L17)

是否开启后台异步更新 (SWR)

***

### cache

> **cache**: `SmartCache`

Defined in: [types.ts:8](https://github.com/isdk/proxy-crawlee.js/blob/be04cca1b979eb306ac7188ee39287f3a8d67fa6/src/types.ts#L8)

SmartCache 实例

***

### config

> **config**: `ProxySiteConfig`

Defined in: [types.ts:10](https://github.com/isdk/proxy-crawlee.js/blob/be04cca1b979eb306ac7188ee39287f3a8d67fa6/src/types.ts#L10)

站点级缓存配置

***

### fetcher()?

> `optional` **fetcher**: (`request`) => `Promise`\<`Response`\>

Defined in: [types.ts:15](https://github.com/isdk/proxy-crawlee.js/blob/be04cca1b979eb306ac7188ee39287f3a8d67fa6/src/types.ts#L15)

自定义 Fetcher。
如果不提供，且在 HTTP 环境下，将默认尝试使用 `got-scraping`。

#### Parameters

##### request

`Request`

#### Returns

`Promise`\<`Response`\>

***

### navigationOnly?

> `optional` **navigationOnly**: `boolean`

Defined in: [types.ts:22](https://github.com/isdk/proxy-crawlee.js/blob/be04cca1b979eb306ac7188ee39287f3a8d67fa6/src/types.ts#L22)

是否只缓存主文档请求 (Navigation Requests)。
仅对 Playwright 引擎生效。默认：true。
