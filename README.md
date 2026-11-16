# Snip

Snip is a tiny URL shortener with one backend and two clients: an Angular web
app and a Node.js command-line tool. The backend keeps links in memory, so a
server restart clears them.

## Repository layout

| Path | Branch | Contents |
| --- | --- | --- |
| `backend/` | `backend` | Bun API server |
| `frontend/` | `frontend` | Angular 19 web app |
| `cli/` | `cli` | Zero-dependency Node.js CLI |
| `bundle/` | `bundle` | Generated release output |

Each component's files live at the root of its own branch. On `main`, these
directories are Git submodules that pin exact commits from this repository.

## API contract

| Method | Path | Request | Result |
| --- | --- | --- | --- |
| `POST` | `/api/links` | `{ "url": "https://…" }` | `201` `{ code, url, shortUrl, hits, createdAt }`; `400` for invalid JSON or a non-HTTP(S) URL |
| `GET` | `/api/links` | — | `200` array of links |
| `GET` | `/:code` | — | `302` redirect and incremented hit count; `404` if unknown |

## Clone

Use `--recurse-submodules` so Git populates all component folders:

```sh
git clone --recurse-submodules https://github.com/aliciatay-zls/snip-workshop_day1.git
```

For an existing plain clone, run `git submodule update --init --recursive`.

## Run locally

Start the backend in one terminal:

```sh
cd backend
bun start
```

Start the web app in another terminal:

```sh
cd frontend
npm install
npx ng serve
```

Use the CLI from a third terminal:

```sh
cd cli
node cli.js ls
node cli.js add https://example.com
node cli.js open <code>
```

The backend listens on port `3000` by default, and the Angular app on port
`4200`.

## Update a component

Commit and push changes from inside the component checkout first:

```sh
cd backend
# edit files
git add -A
git commit -m "Describe backend change"
git push
cd ..
git submodule update --remote backend
git add backend
git commit -m "Bump backend submodule"
git push
```

Use the same flow for `frontend` or `cli`. The component push advances its
branch; the superproject commit records the new pinned commit. The generated
`bundle/` branch is updated by `node scripts/build-bundle.mjs`, not by hand.

## Generate a release bundle

From `main`, run `node scripts/build-bundle.mjs` to update source submodules,
build the Angular app, and assemble the generated `bundle/` submodule. The
script commits changed bundle output and submodule pointers; a second run with
no source changes reports `unchanged`. Use `node scripts/build-bundle.mjs
--push` to push the bundle branch and `main`. The bundle serves the API and
redirects together with the built web app on port `3000`.
