# Snip frontend

Angular 19 client for the Snip URL shortener. The form accepts only valid HTTP(S)
URLs and sends requests to `http://localhost:3000/api/links`.

## Run locally

```sh
npm install
npx ng serve
```

Start the backend with `bun start` in its branch checkout. The UI runs at
`http://localhost:4200`.

## Build

```sh
npx ng build
```

The production files are written to `dist/snip-frontend/browser`.
