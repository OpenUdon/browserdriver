# Tech Stack

- Node.js 24
- TypeScript 5.9.2 in strict mode
- Playwright 1.62.1, Chromium
- Node's built-in test runner

Default verification is offline and does not install or launch a browser:

```bash
npm ci --ignore-scripts
npm test
npm audit --omit=dev
git diff --check
```

The single TypeScript implementation serves both protocol versions. V2 keeps
the UWS 1.7 main-page contract; v3 adds only UWS 1.8 context qualification and
does not add another browser implementation.
