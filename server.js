import { createHash } from "node:crypto";
import { createReadStream, existsSync, statSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { connect } from "node:net";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

const root = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(root, "public");
const vendorDir = join(root, "node_modules", "@novnc", "novnc");
const port = Number(process.env.PORT || 8080);
const adminToken = process.env.ADMIN_TOKEN || "";
const macVncHost = process.env.MAC_VNC_HOST || "127.0.0.1";
const macVncPort = Number(process.env.MAC_VNC_PORT || 5901);
const forceMacVncAuth = process.env.MAC_FORCE_VNC_AUTH !== "0";
const startedAt = new Date();

const teslaDashboard = {
  ok: true,
  source: "fixture",
  updatedAt: "2026-06-06T07:40:00.000Z",
  vehicle: {
    name: "Model Y",
    state: "asleep",
    soc: 68,
    rangeKm: 318,
    odometerKm: 28642,
    location: "Home"
  },
  overview: {
    todayDistanceKm: 42.6,
    todayEnergyKwh: 6.9,
    avgWhKm: 162,
    alerts: 1,
    lastSleepMinutes: 18
  },
  battery: {
    healthPercent: 92.4,
    usableKwh: 70.8,
    confidence: 74,
    projectedRangeKm: [
      { label: "Jan", value: 529 },
      { label: "Feb", value: 526 },
      { label: "Mar", value: 524 },
      { label: "Apr", value: 521 },
      { label: "May", value: 520 },
      { label: "Jun", value: 518 }
    ],
    capacityKwh: [
      { label: "Jan", value: 72.1 },
      { label: "Feb", value: 71.8 },
      { label: "Mar", value: 71.5 },
      { label: "Apr", value: 71.1 },
      { label: "May", value: 70.9 },
      { label: "Jun", value: 70.8 }
    ]
  },
  charging: {
    sessions: 18,
    acPercent: 72,
    dcPercent: 28,
    cost: 86.4,
    efficiencyPercent: 91,
    curve: [
      { label: "10%", value: 148 },
      { label: "20%", value: 142 },
      { label: "30%", value: 129 },
      { label: "40%", value: 105 },
      { label: "50%", value: 82 },
      { label: "60%", value: 61 },
      { label: "70%", value: 43 },
      { label: "80%", value: 28 }
    ]
  },
  drives: {
    trips: [
      { route: "Home -> Office", distanceKm: 21.4, whKm: 158, tempC: 28 },
      { route: "Office -> Home", distanceKm: 21.2, whKm: 166, tempC: 31 },
      { route: "Airport Loop", distanceKm: 64.8, whKm: 174, tempC: 30 },
      { route: "Downtown", distanceKm: 13.6, whKm: 149, tempC: 27 }
    ],
    weeklyWhKm: [
      { label: "Mon", value: 159 },
      { label: "Tue", value: 166 },
      { label: "Wed", value: 161 },
      { label: "Thu", value: 171 },
      { label: "Fri", value: 162 },
      { label: "Sat", value: 154 },
      { label: "Sun", value: 168 }
    ]
  },
  sleep: {
    nightlyDrainPercent: 1.2,
    wakeCount: 3,
    sleepLatencyMinutes: 18,
    sessions: [
      { label: "Mon", value: 0.8 },
      { label: "Tue", value: 1.1 },
      { label: "Wed", value: 1.7 },
      { label: "Thu", value: 0.9 },
      { label: "Fri", value: 1.2 },
      { label: "Sat", value: 1.4 },
      { label: "Sun", value: 1.0 }
    ]
  }
};

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

const checkTcp = (host, targetPort, timeout = 1200) =>
  new Promise((resolve) => {
    const socket = connect({ host, port: targetPort });
    const done = (ok, error) => {
      socket.destroy();
      resolve({ ok, error });
    };
    socket.setTimeout(timeout);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false, "timeout"));
    socket.once("error", (error) => done(false, error.code || error.message));
  });

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

  if (req.url === "/api/mac/status") {
    const status = await checkTcp(macVncHost, macVncPort);
    return json(res, status.ok ? 200 : 503, {
      ok: status.ok,
      target: `${macVncHost}:${macVncPort}`,
      hint: status.ok ? "ready" : "start Mac screen sharing and reverse tunnel",
      error: status.error
    });
  }

  if (req.url === "/api/tesla/dashboard") {
    return json(res, 200, {
      ...teslaDashboard,
      updatedAt: new Date().toISOString()
    });
  }

  return json(res, 404, { ok: false, error: "not_found" });
};

const serveFile = (req, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const isVendor = requested.startsWith("/vendor/novnc/");
  const baseDir = isVendor ? vendorDir : publicDir;
  const relativePath = isVendor ? requested.replace("/vendor/novnc/", "/") : requested;
  let safePath;
  try {
    safePath = normalize(decodeURIComponent(relativePath)).replace(/^(\.\.[/\\])+/, "");
  } catch {
    res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    res.end("Bad request");
    return;
  }
  const filePath = join(baseDir, safePath);

  if (!filePath.startsWith(baseDir) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  const type = mime[extname(filePath)] || "application/octet-stream";
  const immutable = /\.(png|svg|ico)$/.test(filePath) || isVendor;
  res.writeHead(200, {
    "content-type": type,
    "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache"
  });
  createReadStream(filePath).pipe(res);
};

const server = createServer((req, res) => {
  if (req.url?.startsWith("/api/")) {
    handleApi(req, res).catch((error) => json(res, 500, { ok: false, error: error.message }));
    return;
  }
  serveFile(req, res);
});

const wss = new WebSocketServer({ noServer: true });

wss.on("connection", (ws) => {
  const tcp = connect({ host: macVncHost, port: macVncPort });
  tcp.setNoDelay(true);
  if (ws._socket) ws._socket.setNoDelay(true);
  let vncPhase = "banner";

  const sendToBrowser = (data) => {
    if (ws.readyState === ws.OPEN) ws.send(data);
  };

  const handleVncServerData = (data) => {
    if (!forceMacVncAuth) {
      sendToBrowser(data);
      return;
    }

    if (vncPhase === "banner" && data.length >= 12 && data.subarray(0, 4).toString() === "RFB ") {
      sendToBrowser(Buffer.from("RFB 003.008\n"));
      vncPhase = "security";
      if (data.length > 12) handleVncServerData(data.subarray(12));
      return;
    }

    if (vncPhase === "security" && data.length >= 2) {
      const count = data[0];
      const types = [...data.subarray(1, 1 + count)];
      if (count > 0 && data.length >= 1 + count && types.includes(2)) {
        sendToBrowser(Buffer.from([1, 2]));
        vncPhase = "passthrough";
        if (data.length > 1 + count) sendToBrowser(data.subarray(1 + count));
        return;
      }
    }

    sendToBrowser(data);
  };

  tcp.on("data", (data) => {
    handleVncServerData(data);
  });
  tcp.on("error", () => ws.close(1011, "VNC target unavailable"));
  tcp.on("close", () => ws.close());

  ws.on("message", (message) => {
    if (!tcp.destroyed) tcp.write(Buffer.from(message));
  });
  ws.on("close", () => tcp.destroy());
  ws.on("error", () => tcp.destroy());
});

server.on("upgrade", (req, socket, head) => {
  if (new URL(req.url || "/", "http://localhost").pathname !== "/mac/ws") {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Better Tesla listening on ${port}`);
});
