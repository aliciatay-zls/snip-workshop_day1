# Snip CLI

A zero-dependency Node.js command-line client for the Snip URL shortener API.
Node.js 20 or newer is required.

```sh
./snip help
./snip add https://example.com
./snip ls
./snip open abc123
```

Set `SNIP_API` to point at another API base URL; it defaults to
`http://localhost:3000`. On Windows, use `snip.cmd` or `snip.ps1`.

Run the CLI checks with `npm test`.
