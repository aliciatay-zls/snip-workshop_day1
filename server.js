import { resolve, sep } from "node:path";

const links = new Map();
const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const port = Number(process.env.PORT || 3000);
const baseUrl = (
  process.env.BASE_URL ||
  (process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : `http://localhost:${port}`)
).replace(/\/+$/, "");
const publicDir = process.env.PUBLIC_DIR ? resolve(process.env.PUBLIC_DIR) : null;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function createCode() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

async function serveStatic(pathname, method) {
  if (!publicDir || (method !== "GET" && method !== "HEAD")) return null;

  let relativePath;
  try {
    relativePath = decodeURIComponent(pathname === "/" ? "/index.html" : pathname);
  } catch {
    return null;
  }

  const filePath = resolve(publicDir, `.${relativePath}`);
  if (filePath !== publicDir && !filePath.startsWith(`${publicDir}${sep}`)) return null;

  const file = Bun.file(filePath);
  if (!(await file.exists())) return null;
  return new Response(method === "HEAD" ? null : file, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (pathname === "/api/links" && request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "Request body must be valid JSON." }, 400);
      }

      let destination;
      try {
        if (typeof body?.url !== "string") throw new Error("invalid URL");
        destination = new URL(body.url);
        if (destination.protocol !== "http:" && destination.protocol !== "https:") {
          throw new Error("unsupported protocol");
        }
      } catch {
        return json({ error: "url must be a valid http or https URL." }, 400);
      }

      let code;
      do {
        code = createCode();
      } while (links.has(code));

      const link = {
        code,
        url: body.url,
        shortUrl: `${baseUrl}/${code}`,
        hits: 0,
        createdAt: new Date().toISOString(),
      };
      links.set(code, link);
      return json(link, 201);
    }

    if (pathname === "/api/links" && request.method === "GET") {
      return json(Array.from(links.values()));
    }

    if (request.method === "GET" || request.method === "HEAD") {
      const staticResponse = await serveStatic(pathname, request.method);
      if (staticResponse) return staticResponse;
    }

    if (request.method === "GET" && pathname !== "/" && !pathname.slice(1).includes("/")) {
      let code;
      try {
        code = decodeURIComponent(pathname.slice(1));
      } catch {
        return json({ error: "Not found." }, 404);
      }
      const link = links.get(code);
      if (link) {
        link.hits += 1;
        return new Response(null, {
          status: 302,
          headers: {
            "Access-Control-Allow-Origin": "*",
            Location: link.url,
          },
        });
      }
    }

    return json({ error: "Not found." }, 404);
  },
});

console.log(`Snip backend listening on ${baseUrl}`);
