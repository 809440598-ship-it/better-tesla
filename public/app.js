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

const formatUptime = (seconds = 0) => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
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
    card.innerHTML = `
      <span class="service-icon" aria-hidden="true">${iconMap[service.icon] || "•"}</span>
      <span class="service-title">${service.title}</span>
      <span class="service-subtitle">${service.subtitle}</span>
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
    $("#serverState").textContent = payload.ok ? "Online" : "Degraded";
    $("#uptime").textContent = formatUptime(payload.uptimeSeconds);
    $("#serviceCount").textContent = payload.serviceCount;
    $("#buildId").textContent = payload.build;
    pulse.className = `pulse ${payload.ok ? "is-online" : "is-offline"}`;
  } catch (error) {
    $("#serverState").textContent = "Offline";
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
  $("#clock").textContent = new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date());
};

const openSettings = () => {
  $("#macUrl").value = saved.macUrl || "";
  $("#vncPassword").value = saved.vncPassword || localStorage.getItem("betterTesla.vncPassword") || "";
  $("#codexUrl").value = saved.codexUrl || "";
  $("#homeUrl").value = saved.homeUrl || "";
  $("#adminToken").value = saved.adminToken || "";
  $("#settingsModal").showModal();
};

const saveSettings = () => {
  Object.assign(saved, {
    macUrl: $("#macUrl").value.trim(),
    vncPassword: $("#vncPassword").value.trim(),
    codexUrl: $("#codexUrl").value.trim(),
    homeUrl: $("#homeUrl").value.trim(),
    adminToken: $("#adminToken").value.trim()
  });
  if (saved.vncPassword) localStorage.setItem("betterTesla.vncPassword", saved.vncPassword);
  localStorage.setItem("betterTesla.settings", JSON.stringify(saved));
  services = applyOverrides(services);
  renderServices();
};

const boot = async () => {
  const config = await fetch("/config.json").then((res) => res.json());
  services = applyOverrides(config.services || []);
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
