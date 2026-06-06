const $ = (selector) => document.querySelector(selector);

const iconMap = {
  monitor: "▣",
  terminal: "⌁",
  chart: "▤"
};

const saved = JSON.parse(localStorage.getItem("betterTesla.settings") || "{}");
let services = [];

const normalizeLanguage = (value) => (value === "zh" || value === "en" ? value : null);
let language = normalizeLanguage(saved.language) || (navigator.language?.toLowerCase().startsWith("zh") ? "zh" : "en");

const copy = {
  en: {
    driveConsole: "Drive Console",
    status: "Status",
    refreshStatus: "Refresh status",
    settings: "Settings",
    services: "Services",
    checking: "Checking",
    online: "Online",
    offline: "Offline",
    language: "Language",
    macMiniUrl: "Mac mini URL",
    macVncPassword: "Mac VNC Password",
    macUsername: "Mac Username",
    codexUrl: "Codex URL",
    close: "Close",
    cancel: "Cancel",
    save: "Save",
    localBrowserOnly: "Local browser only",
    optional: "Optional",
    teslaAccount: "Tesla Account",
    connectTesla: "Connect Tesla",
    logout: "Logout",
    details: "Details",
    vehicle: "Vehicle",
    soc: "SOC",
    range: "Range",
    odometer: "Odometer",
    dataSource: "Data Source",
    quickAccess: "Quick Access",
    connected: "Connected",
    notConnected: "Not connected",
    loginHint: "Connect Tesla to show live vehicle data.",
    liveHint: "Live Fleet API data. Historical trends need collection.",
    unavailable: "Unavailable",
    pendingData: "Waiting for data",
    fleetApi: "Fleet API",
    fixture: "Demo"
  },
  zh: {
    driveConsole: "驾驶控制台",
    status: "状态",
    refreshStatus: "刷新状态",
    settings: "设置",
    services: "服务",
    checking: "检查中",
    online: "在线",
    offline: "离线",
    language: "语言",
    macMiniUrl: "Mac mini 地址",
    macVncPassword: "Mac VNC 密码",
    macUsername: "Mac 用户名",
    codexUrl: "Codex 地址",
    close: "关闭",
    cancel: "取消",
    save: "保存",
    localBrowserOnly: "仅保存在本浏览器",
    optional: "可选",
    teslaAccount: "Tesla 账户",
    connectTesla: "连接 Tesla",
    logout: "退出",
    details: "详情",
    vehicle: "车辆",
    soc: "电量",
    range: "续航",
    odometer: "里程",
    dataSource: "数据源",
    quickAccess: "快速入口",
    connected: "已连接",
    notConnected: "未连接",
    loginHint: "连接 Tesla 后显示实时车辆数据。",
    liveHint: "实时 Fleet API 数据，历史趋势需要持续采集。",
    unavailable: "暂无数据",
    pendingData: "等待数据",
    fleetApi: "Fleet API",
    fixture: "演示"
  }
};

const serviceCopy = {
  en: {
    mac: ["Mac mini", "Remote desktop"],
    codex: ["Codex JP", "Remote workspace"],
    home: ["Tesla Data", "Private analytics"]
  },
  zh: {
    mac: ["Mac mini", "远程桌面"],
    codex: ["Codex JP", "远程工作区"],
    home: ["Tesla 数据", "私有趋势看板"]
  }
};

const t = (key) => copy[language]?.[key] || copy.en[key] || key;
const locale = () => (language === "zh" ? "zh-CN" : "en-US");
const hasNumber = (value) => Number.isFinite(Number(value));
const number = (value, digits = 0) => new Intl.NumberFormat(locale(), { maximumFractionDigits: digits }).format(value);
const metric = (value, suffix, digits = 0) => hasNumber(value) ? `${number(value, digits)} ${suffix}` : "--";
const percent = (value) => hasNumber(value) ? `${number(value)}%` : "--";

const applyLanguage = () => {
  document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    node.placeholder = t(node.dataset.i18nPlaceholder);
  });
  document.querySelectorAll("[data-i18n-aria]").forEach((node) => {
    node.setAttribute("aria-label", t(node.dataset.i18nAria));
  });
  document.querySelectorAll("[data-i18n-title]").forEach((node) => {
    node.title = t(node.dataset.i18nTitle);
  });
  const languageSelect = $("#languageSelect");
  if (languageSelect) languageSelect.value = language;
};

const applyOverrides = (items) => {
  const urls = {
    mac: saved.macUrl,
    codex: saved.codexUrl
  };
  return items.map((item) => ({ ...item, url: urls[item.id] || item.url }));
};

const renderServices = () => {
  const grid = $("#serviceGrid");
  grid.innerHTML = "";
  services.forEach((service) => {
    const card = document.createElement("button");
    card.className = "service-card";
    card.dataset.accent = service.accent;
    card.type = "button";
    const [title, subtitle] = serviceCopy[language]?.[service.id] || [service.title, service.subtitle];
    card.innerHTML = `
      <span class="service-icon" aria-hidden="true">${iconMap[service.icon] || "•"}</span>
      <span class="service-title">${title}</span>
      <span class="service-subtitle">${subtitle}</span>
    `;
    card.addEventListener("click", () => openService(service));
    grid.append(card);
  });
};

const openService = (service) => {
  if (!service.url) {
    openSettings();
    return;
  }
  window.location.href = service.url;
};

const renderEmptyTesla = (authenticated = false) => {
  $("#authTitle").textContent = authenticated ? t("connected") : t("notConnected");
  $("#authMeta").textContent = authenticated ? t("pendingData") : t("loginHint");
  $("#vehicleName").textContent = "--";
  $("#vehicleState").textContent = "--";
  $("#socValue").textContent = "--";
  $("#rangeValue").textContent = t("unavailable");
  $("#odometerValue").textContent = "--";
  $("#locationValue").textContent = t("unavailable");
  $("#sourceValue").textContent = "--";
  $("#updatedAt").textContent = "--";
};

const renderTesla = (data) => {
  const vehicle = data.vehicle || {};
  $("#authTitle").textContent = t("connected");
  $("#authMeta").textContent = data.liveError ? data.liveError : t("liveHint");
  $("#vehicleName").textContent = vehicle.name || "--";
  $("#vehicleState").textContent = vehicle.state || "--";
  $("#socValue").textContent = percent(vehicle.soc);
  $("#rangeValue").textContent = `${t("range")} ${metric(vehicle.rangeKm, "km")}`;
  $("#odometerValue").textContent = metric(vehicle.odometerKm, "km");
  $("#locationValue").textContent = vehicle.location || "--";
  $("#sourceValue").textContent = data.source === "fleet_api" ? t("fleetApi") : t("fixture");
  $("#updatedAt").textContent = new Date(data.updatedAt).toLocaleTimeString(locale(), {
    hour: "2-digit",
    minute: "2-digit"
  });
};

const refreshHealth = async () => {
  try {
    const payload = await fetch("/api/health").then((res) => res.json());
    $("#serverState").textContent = `${payload.ok ? t("online") : t("offline")} · ${payload.build}`;
    $("#serverPulse").className = `pulse ${payload.ok ? "is-online" : "is-offline"}`;
  } catch {
    $("#serverState").textContent = t("offline");
    $("#serverPulse").className = "pulse is-offline";
  }
};

const refreshTesla = async () => {
  const loginButton = $("#loginButton");
  const logoutButton = $("#logoutButton");
  loginButton.hidden = true;
  logoutButton.hidden = true;

  const status = await fetch("/api/tesla/auth/status").then((res) => res.json());
  if (!status.authenticated) {
    loginButton.hidden = false;
    renderEmptyTesla(false);
    return;
  }

  logoutButton.hidden = false;
  try {
    const data = await fetch("/api/tesla/dashboard").then((res) => res.json());
    renderTesla(data);
  } catch (error) {
    renderEmptyTesla(true);
    $("#authMeta").textContent = error.message;
  }
};

const tickClock = () => {
  $("#clock").textContent = new Intl.DateTimeFormat(locale(), {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date());
};

const openSettings = () => {
  $("#languageSelect").value = language;
  $("#macUrl").value = saved.macUrl || "";
  $("#vncPassword").value = saved.vncPassword || localStorage.getItem("betterTesla.vncPassword") || "";
  $("#macUsername").value = saved.macUsername || localStorage.getItem("betterTesla.macUsername") || "";
  $("#codexUrl").value = saved.codexUrl || "";
  $("#settingsModal").showModal();
};

const saveSettings = () => {
  language = normalizeLanguage($("#languageSelect").value) || "en";
  Object.assign(saved, {
    language,
    macUrl: $("#macUrl").value.trim(),
    vncPassword: $("#vncPassword").value.trim(),
    macUsername: $("#macUsername").value.trim(),
    codexUrl: $("#codexUrl").value.trim()
  });
  if (saved.vncPassword) localStorage.setItem("betterTesla.vncPassword", saved.vncPassword);
  if (saved.macUsername) localStorage.setItem("betterTesla.macUsername", saved.macUsername);
  localStorage.setItem("betterTesla.settings", JSON.stringify(saved));
  services = applyOverrides(services);
  applyLanguage();
  renderServices();
  tickClock();
  refreshHealth();
  refreshTesla();
};

const boot = async () => {
  const config = await fetch("/config.json").then((res) => res.json());
  services = applyOverrides(config.services || []);
  applyLanguage();
  renderServices();
  tickClock();
  setInterval(tickClock, 10000);
  await Promise.all([refreshHealth(), refreshTesla()]);
};

$("#refreshButton").addEventListener("click", () => {
  refreshHealth();
  refreshTesla();
});
$("#settingsButton").addEventListener("click", openSettings);
$("#loginButton").addEventListener("click", () => {
  window.location.href = "/api/tesla/auth/login";
});
$("#logoutButton").addEventListener("click", async () => {
  await fetch("/api/tesla/auth/logout");
  renderEmptyTesla(false);
  refreshTesla();
});
$("#saveSettings").addEventListener("click", saveSettings);

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("/sw.js");
}

boot();
