[**@isdk/proxy-crawlee**](../README.md)

***

[@isdk/proxy-crawlee](../globals.md) / CrawleeCacheOptions

# Interface: CrawleeCacheOptions

Defined in: [proxy-crawlee/src/types.ts:6](https://github.com/isdk/proxy-crawlee.js/blob/70a84cf65b1c2e2ebbe6bc6887e30e49f3ba1230/src/types.ts#L6)

Crawlee 缓存适配器配置选项

## Extends

- `FetchWithCacheOptions`

## Properties

### activeCacheWrites?

> `optional` **activeCacheWrites**: `Map`\<`string`, `Promise`\<`void`\>\>

Defined in: proxy/dist/index.d.ts:549

并发写入任务追踪器

#### Inherited from

`FetchWithCacheOptions.activeCacheWrites`

***

### backgroundUpdate?

> `optional` **backgroundUpdate**: `boolean`

Defined in: proxy/dist/index.d.ts:539

是否启用后台异步更新 (SWR)

#### Inherited from

`FetchWithCacheOptions.backgroundUpdate`

***

### cache

> **cache**: `SmartCache`

Defined in: proxy/dist/index.d.ts:535

混合缓存实例

#### Inherited from

`FetchWithCacheOptions.cache`

***

### config

> **config**: `ProxySiteConfig`

Defined in: proxy/dist/index.d.ts:537

站点级基础配置

#### Inherited from

`FetchWithCacheOptions.config`

***

### fetcher()?

> `optional` **fetcher**: (`request`) => `Promise`\<`Response`\>

Defined in: [proxy-crawlee/src/types.ts:11](https://github.com/isdk/proxy-crawlee.js/blob/70a84cf65b1c2e2ebbe6bc6887e30e49f3ba1230/src/types.ts#L11)

自定义 Fetcher。
如果不提供，且在 HTTP 环境下，将默认尝试使用 `got-scraping`。

#### Parameters

##### request

`Request`

#### Returns

`Promise`\<`Response`\>

***

### generateKey()?

> `optional` **generateKey**: (`req`, `siteConfig`, `bodyState?`, `effectiveConfig?`) => `Promise`\<`string`\>

Defined in: proxy/dist/index.d.ts:545

自定义缓存键生成函数

根据 Request 对象和配置生成唯一的缓存指纹 (异步)

#### Parameters

##### req

`Request`

请求对象

##### siteConfig

`ProxySiteConfig`

站点级配置

##### bodyState?

可选的 Body 读取状态（用于性能优化，避免重复读取）

###### checked

`boolean`

###### json?

`any`

###### limit

`number`

###### text

`string` \| `null`

##### effectiveConfig?

`ProxyCacheRule`

可选的最终生效配置（用于性能优化，避免重复合并）

#### Returns

`Promise`\<`string`\>

#### Inherited from

`FetchWithCacheOptions.generateKey`

***

### navigationOnly?

> `optional` **navigationOnly**: `boolean`

Defined in: [proxy-crawlee/src/types.ts:16](https://github.com/isdk/proxy-crawlee.js/blob/70a84cf65b1c2e2ebbe6bc6887e30e49f3ba1230/src/types.ts#L16)

是否只缓存主文档请求 (Navigation Requests)。
仅对 Playwright 引擎生效。默认：true。

***

### onBackgroundUpdate()?

> `optional` **onBackgroundUpdate**: (`promise`) => `void`

Defined in: proxy/dist/index.d.ts:543

后台更新 Promise 触发时的回调

#### Parameters

##### promise

`Promise`\<`Response`\>

#### Returns

`void`

#### Inherited from

`FetchWithCacheOptions.onBackgroundUpdate`

***

### refresh?

> `optional` **refresh**: `boolean`

Defined in: proxy/dist/index.d.ts:541

是否强制刷新缓存（跳过读取，但请求成功后会更新缓存）

#### Inherited from

`FetchWithCacheOptions.refresh`
