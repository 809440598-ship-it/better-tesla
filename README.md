# Better Tesla

一个为 Tesla 车机浏览器设计的开源 Web App 入口。

Better Tesla 的目标很简单：把 Tesla 中控屏变成一个真正实用的个人控制台，而不是只能打开零散网页。它不破解车机、不安装非官方车机程序，直接基于 Tesla 浏览器运行，部署在你自己的服务器上。

## 当前版本

V1 是一个可部署、可扩展的车机首页：

- Tesla 横屏大按钮 UI
- Mac mini / Codex / Home / Media / Camera / Logs 快捷入口
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
root@8.216.58.163:/opt/better-tesla
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
│   ├── app.js             # 前端交互
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

## Roadmap

- HTTPS / 域名部署
- Mac mini 远程桌面入口
- Home Assistant 快捷控制
- 摄像头面板
- 服务日志面板
- 移动端配置页
- Tesla Fleet API 状态读取
- 车辆充电 / 空调 / 位置模块
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

## 设计原则

- 不破解 Tesla
- 不影响驾驶安全
- 优先停车场景
- 优先大按钮和低输入成本
- 默认自托管
- 服务器端简单可维护

## License

MIT
