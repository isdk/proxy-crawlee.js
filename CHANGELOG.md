# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## 0.2.0 (2026-05-13)


### ⚠ BREAKING CHANGES

* switch to ESNext + bundler module resolution to fix TS1541
* align cache config schema with @isdk/proxy v0.2
* remove puppeteer suports

### build

* switch to ESNext + bundler module resolution to fix TS1541 ([2c60da2](https://github.com/isdk/proxy-crawlee.js/commit/2c60da2ecacc461dcb760c0455b339d930cd5eb3))


### Features

* refactor crawlee adapter for robust HttpCrawler support and stream handling ([0cb3863](https://github.com/isdk/proxy-crawlee.js/commit/0cb386367c6cc0459e0cf86e6e6146204b8eec8c))


### Bug Fixes

* 修复 CheerioCrawler sendRequest 无法使用缓存的问题 ([e4dc2ed](https://github.com/isdk/proxy-crawlee.js/commit/e4dc2edc321b769a5d2322f1c502e87ea69353df))
* 修复 Playwright/Puppeteer 无法使用缓存的问题 ([41e5239](https://github.com/isdk/proxy-crawlee.js/commit/41e5239ffffbe1e120fdb44a443211e772d81e80))


### Refactor

* align cache config schema with @isdk/proxy v0.2 ([2a329f9](https://github.com/isdk/proxy-crawlee.js/commit/2a329f9f708819f43f2a450052a82f9fd3a900d4))
* remove puppeteer suports ([de50024](https://github.com/isdk/proxy-crawlee.js/commit/de500247b957021cb95f4d5cb42f4a0825ee366f))
