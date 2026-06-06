import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
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
const teslaClientId = process.env.TESLA_CLIENT_ID || "";
const teslaClientSecret = process.env.TESLA_CLIENT_SECRET || "";
const teslaRedirectUri = process.env.TESLA_REDIRECT_URI || "";
const teslaAudience = process.env.TESLA_AUDIENCE || "https://fleet-api.prd.na.vn.cloud.tesla.com";
const teslaScopes = process.env.TESLA_SCOPES || "openid offline_access vehicle_device_data";
const teslaAuthUrl = process.env.TESLA_AUTH_URL || "https://auth.tesla.com/oauth2/v3/authorize";
const teslaTokenUrl = process.env.TESLA_TOKEN_URL || "https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token";
const sessionSecret = process.env.SESSION_SECRET || randomBytes(32).toString("hex");
const startedAt = new Date();
const authStates = new Map();
const sessions = new Map();
const regionCache = new Map();

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

const milesToKm = (value) => Number.isFinite(Number(value)) ? Number((Number(value) * 1.609344).toFixed(1)) : null;
const numberOrNull = (value) => Number.isFinite(Number(value)) ? Number(value) : null;

const emptySeries = (labels) => labels.map((label) => ({ label, value: null }));

const pendingDashboard = {
  overview: {
    todayDistanceKm: null,
    todayEnergyKwh: null,
    avgWhKm: null,
    alerts: null,
    lastSleepMinutes: null
  },
  battery: {
    healthPercent: null,
    usableKwh: null,
    confidence: null,
    projectedRangeKm: emptySeries(["Jan", "Feb", "Mar", "Apr", "May", "Jun"]),
    capacityKwh: emptySeries(["Jan", "Feb", "Mar", "Apr", "May", "Jun"])
  },
  charging: {
    sessions: null,
    acPercent: null,
    dcPercent: null,
    cost: null,
    efficiencyPercent: null,
    curve: emptySeries(["10%", "20%", "30%", "40%", "50%", "60%", "70%", "80%"])
  },
  drives: {
    trips: [],
    weeklyWhKm: emptySeries(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])
  },
  sleep: {
    nightlyDrainPercent: null,
    wakeCount: null,
    sleepLatencyMinutes: null,
    sessions: emptySeries(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])
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

const html = (res, status, body) => {
  res.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
};

const authErrorPage = (message) => `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Tesla OAuth Error</title>
    <style>
      body { margin: 0; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #eef3f7; color: #111827; }
      main { display: grid; min-height: 100vh; place-items: center; padding: 24px; }
      section { width: min(560px, 100%); padding: 28px; border: 1px solid rgba(30,41,59,.12); border-radius: 8px; background: white; box-shadow: 0 18px 46px rgba(15,23,42,.08); }
      h1 { margin: 0 0 12px; font-size: 28px; }
      p { color: #64748b; font-weight: 700; line-height: 1.6; }
      a { display: inline-flex; align-items: center; min-height: 46px; margin-top: 14px; padding: 0 18px; border-radius: 8px; background: #2563eb; color: white; text-decoration: none; font-weight: 900; }
    </style>
  </head>
  <body>
    <main>
      <section>
        <h1>Tesla 授权需要重新开始</h1>
        <p>${message}</p>
        <a href="/api/tesla/auth/login">重新连接 Tesla</a>
      </section>
    </main>
  </body>
</html>`;

const parseCookies = (req) =>
  Object.fromEntries((req.headers.cookie || "").split(";").filter(Boolean).map((part) => {
    const [key, ...value] = part.trim().split("=");
    return [key, decodeURIComponent(value.join("="))];
  }));

const sign = (value) => createHmac("sha256", sessionSecret).update(value).digest("base64url");

const safeEqual = (left, right) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};

const packSession = (sessionId) => `${sessionId}.${sign(sessionId)}`;

const unpackSession = (cookie = "") => {
  const [sessionId, signature] = cookie.split(".");
  if (!sessionId || !signature) return "";
  return safeEqual(sign(sessionId), signature) ? sessionId : "";
};

const setSessionCookie = (res, sessionId) => {
  res.setHeader("set-cookie", `bt_session=${packSession(sessionId)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`);
};

const clearSessionCookie = (res) => {
  res.setHeader("set-cookie", "bt_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0");
};

const setOAuthStateCookie = (res, state) => {
  const value = packSession(state);
  const next = `bt_oauth_state=${value}; HttpOnly; Secure; SameSite=Lax; Path=/api; Max-Age=600`;
  const current = res.getHeader("set-cookie");
  res.setHeader("set-cookie", current ? [current, next].flat() : next);
};

const clearOAuthStateCookie = (res) => {
  const next = "bt_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/api; Max-Age=0";
  const current = res.getHeader("set-cookie");
  res.setHeader("set-cookie", current ? [current, next].flat() : next);
};

const getOAuthState = (req) => unpackSession(parseCookies(req).bt_oauth_state);

const getSession = (req) => {
  const sessionId = unpackSession(parseCookies(req).bt_session);
  if (!sessionId) return null;
  return sessions.get(sessionId) || null;
};

const getOrigin = (req) => {
  const proto = req.headers["x-forwarded-proto"] || (req.socket.encrypted ? "https" : "http");
  return `${proto}://${req.headers.host}`;
};

const getTeslaRedirectUri = (req) => teslaRedirectUri || `${getOrigin(req)}/api/tesla/auth/callback`;

const isTeslaConfigured = () => Boolean(teslaClientId && teslaClientSecret);

const requestTeslaToken = async (params) => {
  const response = await fetch(teslaTokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || `tesla_token_${response.status}`);
  }
  return payload;
};

const refreshTeslaToken = async (session) => {
  const token = await requestTeslaToken({
    grant_type: "refresh_token",
    client_id: teslaClientId,
    refresh_token: session.refreshToken
  });
  session.accessToken = token.access_token;
  session.refreshToken = token.refresh_token || session.refreshToken;
  session.expiresAt = Date.now() + Math.max((token.expires_in || 3600) - 60, 60) * 1000;
  return session.accessToken;
};

const getAccessToken = async (session) => {
  if (!session) throw new Error("not_authenticated");
  if (Date.now() >= session.expiresAt) return refreshTeslaToken(session);
  return session.accessToken;
};

const teslaFetch = async (session, path) => {
  const accessToken = await getAccessToken(session);
  const cacheKey = session.region || "default";
  let baseUrl = regionCache.get(cacheKey) || session.baseUrl || teslaAudience;
  let response = await fetch(new URL(path, `${baseUrl}/`), {
    headers: { authorization: `Bearer ${accessToken}` }
  });

  if (response.status === 421) {
    const region = await response.json().catch(() => ({}));
    baseUrl = region.response?.fleet_api_base_url || region.fleet_api_base_url || baseUrl;
    session.baseUrl = baseUrl;
    regionCache.set(cacheKey, baseUrl);
    response = await fetch(new URL(path, `${baseUrl}/`), {
      headers: { authorization: `Bearer ${accessToken}` }
    });
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error_description || payload.error || `tesla_api_${response.status}`);
  return payload;
};

const fetchTeslaVehicles = async (session) => {
  const payload = await teslaFetch(session, "/api/1/vehicles");
  return payload.response || [];
};

const fetchTeslaVehicleData = async (session, vehicle) => {
  if (vehicle.state !== "online") return null;
  const vehicleId = vehicle.id_s || vehicle.id;
  if (!vehicleId) return null;
  const payload = await teslaFetch(session, `/api/1/vehicles/${encodeURIComponent(vehicleId)}/vehicle_data`);
  return payload.response || null;
};

const buildLiveTeslaDashboard = async (session) => {
  const vehicles = await fetchTeslaVehicles(session);
  const vehicle = vehicles[0] || null;
  const live = vehicle ? await fetchTeslaVehicleData(session, vehicle).catch((error) => ({ error: error.message })) : null;
  const charge = live?.charge_state || {};
  const state = live?.vehicle_state || {};
  const drive = live?.drive_state || {};
  const vehicleConfig = live?.vehicle_config || {};
  const displayName = vehicle?.display_name || state.vehicle_name || vehicle?.vin || vehicle?.id_s || "Tesla";
  const stateText = live?.state || vehicle?.state || "unknown";

  return {
    ok: true,
    source: "fleet_api",
    partial: Boolean(!live || live.error),
    updatedAt: new Date().toISOString(),
    vehicles,
    liveError: live?.error || null,
    vehicle: {
      name: displayName,
      state: stateText,
      soc: numberOrNull(charge.battery_level),
      rangeKm: milesToKm(charge.battery_range ?? charge.est_battery_range ?? charge.ideal_battery_range),
      odometerKm: milesToKm(state.odometer),
      location: drive.latitude && drive.longitude ? `${Number(drive.latitude).toFixed(4)}, ${Number(drive.longitude).toFixed(4)}` : "--",
      model: vehicleConfig.car_type || null,
      vin: vehicle?.vin || null
    },
    ...pendingDashboard
  };
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
  const url = new URL(req.url || "/", "http://localhost");

  if (url.pathname === "/api/health") {
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

  if (url.pathname === "/api/admin/system") {
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

  if (url.pathname === "/api/mac/status") {
    const status = await checkTcp(macVncHost, macVncPort);
    return json(res, status.ok ? 200 : 503, {
      ok: status.ok,
      target: `${macVncHost}:${macVncPort}`,
      hint: status.ok ? "ready" : "start Mac screen sharing and reverse tunnel",
      error: status.error
    });
  }

  if (url.pathname === "/api/tesla/auth/status") {
    const session = getSession(req);
    return json(res, 200, {
      ok: true,
      configured: isTeslaConfigured(),
      authenticated: Boolean(session),
      scopes: teslaScopes.split(" "),
      expiresAt: session?.expiresAt ? new Date(session.expiresAt).toISOString() : null
    });
  }

  if (url.pathname === "/api/tesla/auth/login") {
    if (!isTeslaConfigured()) {
      return json(res, 503, {
        ok: false,
        error: "tesla_oauth_not_configured",
        requiredEnv: ["TESLA_CLIENT_ID", "TESLA_CLIENT_SECRET"],
        redirectUri: getTeslaRedirectUri(req)
      });
    }
    const state = randomBytes(24).toString("base64url");
    authStates.set(state, { createdAt: Date.now() });
    setOAuthStateCookie(res, state);
    const authorizeUrl = new URL(teslaAuthUrl);
    authorizeUrl.searchParams.set("client_id", teslaClientId);
    authorizeUrl.searchParams.set("locale", "en-US");
    authorizeUrl.searchParams.set("prompt", "login");
    authorizeUrl.searchParams.set("redirect_uri", getTeslaRedirectUri(req));
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("scope", teslaScopes);
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("audience", teslaAudience);
    res.writeHead(302, { location: authorizeUrl.toString(), "cache-control": "no-store" });
    res.end();
    return;
  }

  if (url.pathname === "/api/tesla/auth/callback" || url.pathname === "/api/auth/callback") {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const savedState = state ? authStates.get(state) : null;
    const cookieState = getOAuthState(req);
    const validMemoryState = savedState && Date.now() - savedState.createdAt <= 10 * 60 * 1000;
    const validCookieState = cookieState && state && safeEqual(cookieState, state);
    if (!code || !state || (!validMemoryState && !validCookieState)) {
      return html(res, 400, authErrorPage("授权状态已过期或服务器刚重启。请从 Better Tesla 重新点击连接。"));
    }
    authStates.delete(state);
    clearOAuthStateCookie(res);
    let token;
    try {
      token = await requestTeslaToken({
        grant_type: "authorization_code",
        client_id: teslaClientId,
        client_secret: teslaClientSecret,
        code,
        redirect_uri: getTeslaRedirectUri(req),
        audience: teslaAudience
      });
    } catch (error) {
      clearOAuthStateCookie(res);
      return html(res, 400, authErrorPage(`Tesla 授权码已过期或已被使用。请重新连接 Tesla。${error.message ? ` (${error.message})` : ""}`));
    }
    const sessionId = randomBytes(32).toString("base64url");
    sessions.set(sessionId, {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: Date.now() + Math.max((token.expires_in || 3600) - 60, 60) * 1000,
      baseUrl: teslaAudience,
      createdAt: Date.now()
    });
    setSessionCookie(res, sessionId);
    res.writeHead(302, { location: "/data.html?tesla=connected", "cache-control": "no-store" });
    res.end();
    return;
  }

  if (url.pathname === "/api/tesla/auth/logout") {
    const sessionId = unpackSession(parseCookies(req).bt_session);
    if (sessionId) sessions.delete(sessionId);
    clearSessionCookie(res);
    return json(res, 200, { ok: true });
  }

  if (url.pathname === "/api/tesla/vehicles") {
    const session = getSession(req);
    if (!session) return json(res, 401, { ok: false, error: "not_authenticated" });
    const vehicles = await fetchTeslaVehicles(session);
    return json(res, 200, { ok: true, response: vehicles });
  }

  if (url.pathname === "/api/tesla/dashboard") {
    const session = getSession(req);
    if (session) {
      return json(res, 200, await buildLiveTeslaDashboard(session));
    }
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
