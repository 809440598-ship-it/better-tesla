# Better Tesla

一个为 Tesla 车机浏览器设计的开源 Web App 入口。

Better Tesla 的目标很简单：把 Tesla 中控屏变成一个真正实用的个人控制台，而不是只能打开零散网页。它不破解车机、不安装非官方车机程序，直接基于 Tesla 浏览器运行，部署在你自己的服务器上。

## 当前版本

V1 是一个可部署、可扩展的车机首页：

- Tesla 横屏大按钮 UI
- Mac mini / Codex / Home / Media / Camera / Logs 快捷入口
- Tesla 私有数据看板 V1：Overview / Battery / Charging / Drives
- 车机内设置入口 URL
- JP 后端健康检查
- 服务器系统状态接口
- PWA manifest
- systemd 部署脚本
- 无前端构建依赖，Node.js 直接运行

线上默认访问方式：

```text
http://your-server-ip
```

## 为什么做这个

Tesla 没有开放传统意义上的车机 App 安装能力。  
但 Tesla 浏览器足够承载一个轻量控制台：

- 远程访问 Mac mini
- 打开 Home Assistant
- 查看 NAS / 摄像头 / 下载器
- 跳转 Codex 远程工作区
- 接入自己的后端服务
- 后续接 Tesla Fleet API

Better Tesla 想做成一个开源底座，让更多人把自己的车机工作流接进来。

## 快速开始

本地运行：

```bash
node server.js
```

打开：

```text
http://127.0.0.1:8080
```

部署到服务器：

```bash
./scripts/deploy.sh
```

默认部署到：

```text
root@example.com:/opt/better-tesla
```

可通过环境变量改目标：

```bash
HOST=root@example.com APP_DIR=/opt/better-tesla ./scripts/deploy.sh
```

## 项目结构

```text
.
├── server.js              # Node.js 静态服务和 API
├── public/
│   ├── index.html         # 车机首页
│   ├── data.html          # Tesla 私有数据看板
│   ├── app.js             # 前端交互
│   ├── data.js            # 数据看板交互
│   ├── styles.css         # Tesla 横屏 UI
│   ├── config.json        # 默认快捷入口
│   ├── sw.js              # PWA 缓存
│   └── assets/            # 背景图和图标
└── scripts/
    └── deploy.sh          # rsync + systemd 部署
```

## API

健康检查：

```http
GET /api/health
```

系统状态：

```http
GET /api/admin/system
```

如果设置了 `ADMIN_TOKEN`，需要带 header：

```http
x-admin-token: your-token
```

Tesla 数据看板：

```http
GET /api/tesla/dashboard
```

当前返回 fixture 数据，用于验证页面结构。后续可以替换为 TeslaMate Postgres、Tesla Fleet API 或 Fleet Telemetry adapter。

Tesla OAuth：

```http
GET /api/tesla/auth/login
GET /api/tesla/auth/status
GET /api/tesla/vehicles
GET /api/tesla/auth/logout
```

服务器环境变量放在 `/etc/better-tesla.env`，不要提交到 Git：

```bash
TESLA_CLIENT_ID=your-client-id
TESLA_CLIENT_SECRET=your-client-secret
TESLA_REDIRECT_URI=https://your-domain/api/tesla/auth/callback
TESLA_SCOPES=openid offline_access vehicle_device_data
SESSION_SECRET=replace-with-long-random-string
```

如果你的 Tesla Developer App 是中国区凭据，还需要：

```bash
TESLA_AUTH_URL=https://auth.tesla.cn/oauth2/v3/authorize
TESLA_TOKEN_URL=https://auth.tesla.cn/oauth2/v3/token
TESLA_AUDIENCE=https://fleet-api.prd.cn.vn.cloud.tesla.cn
```

OAuth 登录只跳转 Tesla 官方授权页，不收集用户 Tesla 密码。当前车辆列表接口只读，不做车辆唤醒和控制。

## Tesla Data Dashboard

Better Tesla 的车辆数据方向不是频繁控制车辆，而是长期记录、估算和趋势分析。

V1 页面：

- `Overview`：SOC、续航、今日能耗、休眠状态
- `Battery`：健康度估算、可用容量、Projected Range 趋势
- `Charging`：AC/DC 占比、费用、效率、SOC-功率曲线
- `Drives`：行程、路线、Wh/km、温度影响

设计原则：

- 不保存 Tesla 账号密码
- 优先 OAuth / TeslaMate 数据源
- 少唤醒、多缓存、重趋势
- 电池健康度只作为估算值展示置信度，不包装成官方数值

## Roadmap

- HTTPS / 域名部署
- Mac mini 远程桌面入口
- Home Assistant 快捷控制
- 摄像头面板
- 服务日志面板
- 移动端配置页
- Tesla Fleet API OAuth
- TeslaMate Postgres adapter
- TimescaleDB 长期时序存储
- Fleet Telemetry 流式采集
- 插件化快捷卡片
- 多用户配置

## 共建方向

欢迎贡献这些模块：

- 更好的 Tesla 浏览器兼容性
- 可配置卡片系统
- Guacamole / noVNC / RustDesk Web 接入方案
- Home Assistant 集成
- Fleet API 集成
- Docker / Caddy / Nginx 部署模板
- 更漂亮的车机 UI 主题
- 真实车机使用反馈

## Mac mini Remote

V1.1 内置 noVNC 页面：

```text
/mac.html
```

连接链路：

```text
Tesla Browser -> Better Tesla /mac.html -> /mac/ws -> JP Server localhost:5901 -> SSH reverse tunnel -> Mac mini localhost:5900
```

Mac mini 上需要先打开系统屏幕共享，并允许 VNC 访问。然后在 Mac mini 上启动反向隧道：

```bash
SERVER_HOST=root@example.com ./scripts/mac-mini-tunnel.sh
```

网页里输入你的 VNC password，点击 `Connect`。

## 设计原则

- 不破解 Tesla
- 不影响驾驶安全
- 优先停车场景
- 优先大按钮和低输入成本
- 默认自托管
- 服务器端简单可维护

## License

MIT
