[**@isdk/proxy-crawlee**](../README.md)

***

[@isdk/proxy-crawlee](../globals.md) / webResponseToFulfill

# Function: webResponseToFulfill()

> **webResponseToFulfill**(`response`): `Promise`\<\{ `body`: `Buffer`\<`ArrayBuffer`\>; `headers`: `Record`\<`string`, `string`\>; `status`: `number`; \}\>

Defined in: [proxy-crawlee/src/webResponseToFulfill.ts:4](https://github.com/isdk/proxy-crawlee.js/blob/70a84cf65b1c2e2ebbe6bc6887e30e49f3ba1230/src/webResponseToFulfill.ts#L4)

将 Web 标准 Response 转换为浏览器 Fulfill 选项 (兼容 Playwright)

## Parameters

### response

`Response`

## Returns

`Promise`\<\{ `body`: `Buffer`\<`ArrayBuffer`\>; `headers`: `Record`\<`string`, `string`\>; `status`: `number`; \}\>
