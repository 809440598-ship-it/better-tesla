const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const settings = JSON.parse(localStorage.getItem("betterTesla.settings") || "{}");
const normalizeLanguage = (value) => (value === "zh" || value === "en" ? value : null);
const language = normalizeLanguage(settings.language) || (navigator.language?.toLowerCase().startsWith("zh") ? "zh" : "en");

const copy = {
  en: {
    back: "Back",
    refresh: "Refresh",
    privateData: "Private Data",
    title: "Tesla Data",
    overview: "Overview",
    battery: "Battery",
    charging: "Charging",
    drives: "Drives",
    vehicle: "Vehicle",
    energy: "Energy",
    today: "Today",
    sleepQuality: "Sleep Quality",
    vampireDrain: "Vampire drain",
    estimate: "Estimate",
    batteryHealth: "Battery health",
    usableCapacity: "Usable Capacity",
    projectedRange: "Projected Range",
    rangeTrend: "Range trend",
    mix: "Mix",
    chargingHealth: "Charging health",
    powerCurve: "Power Curve",
    socPower: "SOC to power",
    efficiency: "Efficiency",
    weeklyWhKm: "Weekly Wh/km",
    recentTrips: "Recent Trips",
    routeCompare: "Route compare",
    route: "Route",
    distance: "Distance",
    consumption: "Consumption",
    temperature: "Temp",
    soc: "SOC",
    range: "Range",
    odometer: "Odometer",
    location: "Location",
    state: "State",
    todayDistance: "Today distance",
    todayEnergy: "Today energy",
    avgWhKm: "Avg Wh/km",
    alerts: "Alerts",
    sleepIn: "Sleep in",
    confidence: "Confidence",
    acCharging: "AC charging",
    dcCharging: "DC charging",
    cost: "Cost",
    efficiencyRate: "Efficiency",
    sessions: "Sessions",
    sourceFixture: "Fixture data",
    updated: "Updated"
  },
  zh: {
    back: "返回",
    refresh: "刷新",
    privateData: "私有数据",
    title: "Tesla 数据",
    overview: "总览",
    battery: "电池",
    charging: "充电",
    drives: "行程",
    vehicle: "车辆",
    energy: "能耗",
    today: "今日",
    sleepQuality: "休眠质量",
    vampireDrain: "吸血耗电",
    estimate: "估算",
    batteryHealth: "电池健康度",
    usableCapacity: "可用容量",
    projectedRange: "满电续航",
    rangeTrend: "续航趋势",
    mix: "结构",
    chargingHealth: "充电健康",
    powerCurve: "功率曲线",
    socPower: "SOC 到功率",
    efficiency: "效率",
    weeklyWhKm: "每周 Wh/km",
    recentTrips: "最近行程",
    routeCompare: "路线对比",
    route: "路线",
    distance: "距离",
    consumption: "能耗",
    temperature: "温度",
    soc: "电量",
    range: "续航",
    odometer: "里程",
    location: "位置",
    state: "状态",
    todayDistance: "今日里程",
    todayEnergy: "今日能耗",
    avgWhKm: "平均 Wh/km",
    alerts: "告警",
    sleepIn: "入睡耗时",
    confidence: "置信度",
    acCharging: "慢充",
    dcCharging: "快充",
    cost: "费用",
    efficiencyRate: "效率",
    sessions: "次数",
    sourceFixture: "示例数据",
    updated: "更新"
  }
};

const t = (key) => copy[language]?.[key] || copy.en[key] || key;
const unit = {
  km: "km",
  kwh: "kWh",
  whKm: "Wh/km",
  kw: "kW",
  c: "CNY"
};

const applyLanguage = () => {
  document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-aria]").forEach((node) => {
    node.setAttribute("aria-label", t(node.dataset.i18nAria));
  });
  document.querySelectorAll("[data-i18n-title]").forEach((node) => {
    node.title = t(node.dataset.i18nTitle);
  });
};

const number = (value, digits = 0) => new Intl.NumberFormat(language === "zh" ? "zh-CN" : "en-US", {
  maximumFractionDigits: digits
}).format(value);

const metricCard = (label, value, meta) => `
  <article class="metric-card">
    <span>${label}</span>
    <strong>${value}</strong>
    <small>${meta}</small>
  </article>
`;

const fact = (label, value) => `
  <div>
    <dt>${label}</dt>
    <dd>${value}</dd>
  </div>
`;

const lineChart = (points, suffix = "") => {
  const width = 640;
  const height = 220;
  const pad = 28;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;
  const coords = points.map((point, index) => {
    const x = pad + (index / Math.max(points.length - 1, 1)) * (width - pad * 2);
    const y = height - pad - ((point.value - min) / spread) * (height - pad * 2);
    return { ...point, x, y };
  });
  const path = coords.map((point) => `${point.x},${point.y}`).join(" ");
  const dots = coords.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="4" />`).join("");
  const labels = coords.map((point) => `<text x="${point.x}" y="${height - 6}" text-anchor="middle">${point.label}</text>`).join("");
  return `
    <svg viewBox="0 0 ${width} ${height}" role="img">
      <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" />
      <polyline points="${path}" />
      ${dots}
      ${labels}
      <text x="${pad}" y="20">${number(max, 1)}${suffix}</text>
      <text x="${pad}" y="${height - 36}">${number(min, 1)}${suffix}</text>
    </svg>
  `;
};

const barChart = (points, suffix = "") => {
  const width = 640;
  const height = 220;
  const pad = 28;
  const max = Math.max(...points.map((point) => point.value)) || 1;
  const slot = (width - pad * 2) / points.length;
  const bars = points.map((point, index) => {
    const barWidth = slot * 0.58;
    const x = pad + index * slot + (slot - barWidth) / 2;
    const barHeight = (point.value / max) * (height - pad * 2);
    const y = height - pad - barHeight;
    return `
      <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="5" />
      <text x="${x + barWidth / 2}" y="${height - 6}" text-anchor="middle">${point.label}</text>
      <text x="${x + barWidth / 2}" y="${Math.max(18, y - 8)}" text-anchor="middle">${number(point.value, 1)}${suffix}</text>
    `;
  }).join("");
  return `<svg viewBox="0 0 ${width} ${height}" role="img">${bars}</svg>`;
};

const render = (data) => {
  $("#updatedAt").textContent = `${t("updated")}: ${new Date(data.updatedAt).toLocaleTimeString(language === "zh" ? "zh-CN" : "en-US", {
    hour: "2-digit",
    minute: "2-digit"
  })}`;

  $("#metricCards").innerHTML = [
    metricCard(t("soc"), `${data.vehicle.soc}%`, `${t("range")} ${number(data.vehicle.rangeKm)} ${unit.km}`),
    metricCard(t("todayDistance"), `${number(data.overview.todayDistanceKm, 1)} ${unit.km}`, `${number(data.overview.avgWhKm)} ${unit.whKm}`),
    metricCard(t("batteryHealth"), `${number(data.battery.healthPercent, 1)}%`, `${t("confidence")} ${data.battery.confidence}%`),
    metricCard(t("sleepQuality"), `${number(data.sleep.nightlyDrainPercent, 1)}%`, `${data.sleep.wakeCount} wake`)
  ].join("");

  $("#vehicleName").textContent = data.vehicle.name;
  $("#vehicleState").textContent = data.vehicle.state;
  $("#vehicleFacts").innerHTML = [
    fact(t("soc"), `${data.vehicle.soc}%`),
    fact(t("range"), `${number(data.vehicle.rangeKm)} ${unit.km}`),
    fact(t("odometer"), `${number(data.vehicle.odometerKm)} ${unit.km}`),
    fact(t("location"), data.vehicle.location)
  ].join("");

  $("#todayEnergy").textContent = `${number(data.overview.todayEnergyKwh, 1)} ${unit.kwh}`;
  $("#todayMeta").textContent = `${number(data.overview.todayDistanceKm, 1)} ${unit.km} · ${number(data.overview.avgWhKm)} ${unit.whKm} · ${data.overview.alerts} ${t("alerts")}`;
  $("#sleepChart").innerHTML = barChart(data.sleep.sessions, "%");

  $("#batteryHealth").textContent = `${number(data.battery.healthPercent, 1)}%`;
  $("#batteryConfidence").textContent = `${t("confidence")} ${data.battery.confidence}% · ${t("sourceFixture")}`;
  $("#usableKwh").textContent = `${number(data.battery.usableKwh, 1)} ${unit.kwh}`;
  $("#capacityChart").innerHTML = lineChart(data.battery.capacityKwh, "");
  $("#rangeChart").innerHTML = lineChart(data.battery.projectedRangeKm, unit.km);

  $("#chargingFacts").innerHTML = [
    fact(t("sessions"), data.charging.sessions),
    fact(t("acCharging"), `${data.charging.acPercent}%`),
    fact(t("dcCharging"), `${data.charging.dcPercent}%`),
    fact(t("efficiencyRate"), `${data.charging.efficiencyPercent}%`),
    fact(t("cost"), `${unit.c} ${number(data.charging.cost, 1)}`)
  ].join("");
  $("#chargeCurve").innerHTML = barChart(data.charging.curve, unit.kw);

  $("#driveChart").innerHTML = lineChart(data.drives.weeklyWhKm, "");
  $("#tripRows").innerHTML = data.drives.trips.map((trip) => `
    <tr>
      <td>${trip.route}</td>
      <td>${number(trip.distanceKm, 1)} ${unit.km}</td>
      <td>${number(trip.whKm)} ${unit.whKm}</td>
      <td>${number(trip.tempC)}°</td>
    </tr>
  `).join("");
};

const load = async () => {
  const response = await fetch("/api/tesla/dashboard");
  const data = await response.json();
  render(data);
};

$$(".tab-button").forEach((button) => {
  button.addEventListener("click", () => {
    $$(".tab-button").forEach((item) => item.classList.toggle("is-active", item === button));
    $$(".data-view").forEach((view) => view.classList.toggle("is-active", view.dataset.page === button.dataset.view));
  });
});

$("#refreshButton").addEventListener("click", load);

applyLanguage();
load();
