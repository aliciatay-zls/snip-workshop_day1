# Snip backend

A dependency-free Bun URL shortener API. Links are stored in memory and are
cleared when the server restarts.

## Run

Install Bun 1.x, then start the server:

```sh
bun start
```

The server listens on port `3000` by default. Configure it with `PORT`,
`BASE_URL`, and optionally `PUBLIC_DIR` to serve static files.

## API

- `POST /api/links` with `{"url":"https://example.com"}` creates a link.
- `GET /api/links` lists links and their current hit counts.
- `GET /:code` redirects to the original URL and increments its hit count.
