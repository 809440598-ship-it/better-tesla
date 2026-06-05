const $ = (selector) => document.querySelector(selector);

const iconMap = {
  monitor: "▣",
  terminal: "⌁",
  home: "⌂",
  play: "▶",
  camera: "◉",
  activity: "↯"
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
    server: "Server",
    jpBackend: "JP Backend",
    checking: "Checking",
    online: "Online",
    degraded: "Degraded",
    offline: "Offline",
    uptime: "Uptime",
    serviceCount: "Services",
    build: "Build",
    health: "Health",
    system: "System",
    language: "Language",
    macMiniUrl: "Mac mini URL",
    macVncPassword: "Mac VNC Password",
    macUsername: "Mac Username",
    codexUrl: "Codex URL",
    homeUrl: "Home URL",
    adminToken: "Admin Token",
    close: "Close",
    cancel: "Cancel",
    save: "Save",
    localBrowserOnly: "Local browser only",
    optional: "Optional"
  },
  zh: {
    driveConsole: "驾驶控制台",
    status: "状态",
    refreshStatus: "刷新状态",
    settings: "设置",
    services: "服务",
    server: "服务器",
    jpBackend: "JP 后端",
    checking: "检查中",
    online: "在线",
    degraded: "异常",
    offline: "离线",
    uptime: "运行时间",
    serviceCount: "服务",
    build: "构建",
    health: "健康检查",
    system: "系统",
    language: "语言",
    macMiniUrl: "Mac mini 地址",
    macVncPassword: "Mac VNC 密码",
    macUsername: "Mac 用户名",
    codexUrl: "Codex 地址",
    homeUrl: "Home 地址",
    adminToken: "管理 Token",
    close: "关闭",
    cancel: "取消",
    save: "保存",
    localBrowserOnly: "仅保存在本浏览器",
    optional: "可选"
  }
};

const serviceCopy = {
  en: {
    mac: ["Mac mini", "Remote desktop"],
    codex: ["Codex JP", "Remote workspace"],
    home: ["Home", "Assistant panel"],
    media: ["Media", "Drive queue"],
    camera: ["Camera", "Live view"],
    logs: ["Logs", "Service status"]
  },
  zh: {
    mac: ["Mac mini", "远程桌面"],
    codex: ["Codex JP", "远程工作区"],
    home: ["Home", "助手面板"],
    media: ["媒体", "驾驶队列"],
    camera: ["摄像头", "实时画面"],
    logs: ["日志", "服务状态"]
  }
};

const t = (key) => copy[language]?.[key] || copy.en[key] || key;

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

const formatUptime = (seconds = 0) => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (language === "zh") {
    if (days) return `${days}天 ${hours}小时`;
    if (hours) return `${hours}小时 ${mins}分钟`;
    return `${mins}分钟`;
  }
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${mins}m`;
  return `${mins}m`;
};

const applyOverrides = (items) => {
  const urls = {
    mac: saved.macUrl,
    codex: saved.codexUrl,
    home: saved.homeUrl
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

const openService = async (service) => {
  if (!service.url) {
    openSettings();
    return;
  }
  if (service.url.startsWith("/api/")) {
    await fetchJson(service.url);
    return;
  }
  window.location.href = service.url;
};

const setOutput = (payload) => {
  $("#statusOutput").textContent = JSON.stringify(payload, null, 2);
};

const fetchJson = async (url, options = {}) => {
  const response = await fetch(url, options);
  const payload = await response.json();
  setOutput(payload);
  return payload;
};

const refreshHealth = async () => {
  const pulse = $("#serverPulse");
  try {
    const payload = await fetchJson("/api/health");
    $("#serverState").textContent = payload.ok ? t("online") : t("degraded");
    $("#uptime").textContent = formatUptime(payload.uptimeSeconds);
    $("#serviceCount").textContent = payload.serviceCount;
    $("#buildId").textContent = payload.build;
    pulse.className = `pulse ${payload.ok ? "is-online" : "is-offline"}`;
  } catch (error) {
    $("#serverState").textContent = t("offline");
    $("#uptime").textContent = "--";
    $("#serviceCount").textContent = "--";
    $("#buildId").textContent = "--";
    pulse.className = "pulse is-offline";
    setOutput({ ok: false, error: error.message });
  }
};

const refreshSystem = async () => {
  const headers = {};
  const token = saved.adminToken || "";
  if (token) headers["x-admin-token"] = token;
  await fetchJson("/api/admin/system", { headers });
};

const tickClock = () => {
  $("#clock").textContent = new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-US", {
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
  $("#homeUrl").value = saved.homeUrl || "";
  $("#adminToken").value = saved.adminToken || "";
  $("#settingsModal").showModal();
};

const saveSettings = () => {
  language = normalizeLanguage($("#languageSelect").value) || "en";
  Object.assign(saved, {
    language,
    macUrl: $("#macUrl").value.trim(),
    vncPassword: $("#vncPassword").value.trim(),
    macUsername: $("#macUsername").value.trim(),
    codexUrl: $("#codexUrl").value.trim(),
    homeUrl: $("#homeUrl").value.trim(),
    adminToken: $("#adminToken").value.trim()
  });
  if (saved.vncPassword) localStorage.setItem("betterTesla.vncPassword", saved.vncPassword);
  if (saved.macUsername) localStorage.setItem("betterTesla.macUsername", saved.macUsername);
  localStorage.setItem("betterTesla.settings", JSON.stringify(saved));
  services = applyOverrides(services);
  applyLanguage();
  renderServices();
  tickClock();
  refreshHealth();
};

const boot = async () => {
  const config = await fetch("/config.json").then((res) => res.json());
  services = applyOverrides(config.services || []);
  applyLanguage();
  renderServices();
  tickClock();
  setInterval(tickClock, 10000);
  await refreshHealth();
};

$("#refreshButton").addEventListener("click", refreshHealth);
$("#settingsButton").addEventListener("click", openSettings);
$("#healthButton").addEventListener("click", refreshHealth);
$("#adminButton").addEventListener("click", refreshSystem);
$("#saveSettings").addEventListener("click", saveSettings);

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("/sw.js");
}

boot();
