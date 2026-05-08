# Contributing to @isdk/proxy-crawlee

## Development Setup

```bash
# Install dependencies
pnpm install

# Build the project
pnpm run build

# Run tests
pnpm run test

# Run tests in watch mode
pnpm run test:watch
```

## Code Style

This project uses ESLint and Prettier for code formatting:

```bash
# Check code style
pnpm run style

# Auto-fix code style issues
pnpm run style:fix
```

## Project Structure

```
src/
├── index.ts                    # Main exports
├── types.ts                    # TypeScript type definitions
├── createCrawleeCacheHook.ts   # Main hook implementation
├── defaultFetcher.ts           # Default HTTP fetcher
├── crawleeToWebRequest.ts      # Request format conversion
├── webResponseToFulfill.ts     # Response format conversion (for browser)
├── webResponseToGotResponse.ts # Response format conversion (for got)
└── gotResponseToWebResponse.ts # Response format conversion (from got)
```

## Testing

Tests are co-located with source files using the `.spec.ts` suffix.

```bash
# Run all tests
pnpm run test

# Run specific test file
pnpm run test src/createCrawleeCacheHook.spec.ts

# Run tests with coverage
pnpm run test:coverage
```

## Pull Request Process

1. Fork the repository and create your branch from `main`
2. Run `pnpm run style:fix` to ensure code style compliance
3. Ensure all tests pass: `pnpm run test`
4. Update documentation if needed
5. Submit a pull request with a clear description of changes

## Release

Releases are managed using `commit-and-tag-version`:

```bash
# Create a release (patch)
pnpm run release

# Create a prerelease (alpha)
pnpm run release.alpha
```
