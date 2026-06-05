import { createHash } from "node:crypto";
import { createReadStream, existsSync, statSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(root, "public");
const port = Number(process.env.PORT || 8080);
const adminToken = process.env.ADMIN_TOKEN || "";
const startedAt = new Date();

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json; charset=utf-8"
};

const json = (res, status, body) => {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(payload)
  });
  res.end(payload);
};

const isAuthed = (req) => {
  if (!adminToken) return true;
  return req.headers["x-admin-token"] === adminToken;
};

const readServices = async () => {
  const config = JSON.parse(await readFile(join(publicDir, "config.json"), "utf8"));
  return config.services || [];
};

const directoryDigest = async (dir) => {
  const hash = createHash("sha1");
  const names = await readdir(dir);
  for (const name of names.sort()) {
    const path = join(dir, name);
    const stat = statSync(path);
    hash.update(name);
    hash.update(String(stat.mtimeMs));
    hash.update(String(stat.size));
  }
  return hash.digest("hex").slice(0, 10);
};

const handleApi = async (req, res) => {
  if (req.url === "/api/health") {
    const services = await readServices();
    return json(res, 200, {
      ok: true,
      app: "better-tesla",
      version: "0.1.0",
      serverTime: new Date().toISOString(),
      startedAt: startedAt.toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      serviceCount: services.length,
      build: await directoryDigest(publicDir)
    });
  }

  if (req.url === "/api/admin/system") {
    if (!isAuthed(req)) return json(res, 401, { ok: false, error: "unauthorized" });
    const mem = process.memoryUsage();
    return json(res, 200, {
      ok: true,
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid,
      memoryMb: Math.round(mem.rss / 1024 / 1024),
      env: process.env.NODE_ENV || "production"
    });
  }

  return json(res, 404, { ok: false, error: "not_found" });
};

const serveFile = (req, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = normalize(decodeURIComponent(requested)).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicDir, safePath);

  if (!filePath.startsWith(publicDir) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  const type = mime[extname(filePath)] || "application/octet-stream";
  const immutable = /\.(png|svg|ico)$/.test(filePath);
  res.writeHead(200, {
    "content-type": type,
    "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache"
  });
  createReadStream(filePath).pipe(res);
};

createServer((req, res) => {
  if (req.url?.startsWith("/api/")) {
    handleApi(req, res).catch((error) => json(res, 500, { ok: false, error: error.message }));
    return;
  }
  serveFile(req, res);
}).listen(port, "0.0.0.0", () => {
  console.log(`Better Tesla listening on ${port}`);
});
