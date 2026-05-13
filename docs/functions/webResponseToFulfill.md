[**@isdk/proxy-crawlee**](../README.md)

***

[@isdk/proxy-crawlee](../globals.md) / webResponseToFulfill

# Function: webResponseToFulfill()

> **webResponseToFulfill**(`response`): `Promise`\<\{ `body`: `Buffer`\<`ArrayBuffer`\>; `headers`: `Record`\<`string`, `string`\>; `status`: `number`; \}\>

Defined in: [webResponseToFulfill.ts:4](https://github.com/isdk/proxy-crawlee.js/blob/e4dc2edc321b769a5d2322f1c502e87ea69353df/src/webResponseToFulfill.ts#L4)

将 Web 标准 Response 转换为浏览器 Fulfill 选项 (兼容 Playwright)

## Parameters

### response

`Response`

## Returns

`Promise`\<\{ `body`: `Buffer`\<`ArrayBuffer`\>; `headers`: `Record`\<`string`, `string`\>; `status`: `number`; \}\>
