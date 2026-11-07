# Linyu_PWA v1.0.0

一个无广告的趣智校园 PWA 客户端，附带一个匿名使用统计后端。

> 第三方非官方项目，与趣智校园官方、学校及设备运营方没有隶属关系。  
> 金钱、设备、服务问题请直接联系趣智校园官方。

## 功能

- 4G 水表扫码用水、手动输入设备码
- 余额、项目、预扣金额、账单
- 开阀 / 关阀 / 结算
- 自动翻转开关水
  - 扣下暂停
  - 正面平放继续
  - 拿起手机 3 秒结束（首次进入有 15 秒保护）
  - 操作冷却、失败重试、自动模式状态条
- 本次洗澡账单汇总（金额、时间、笔数、剩余余额）
- 按天折叠的使用记录，近 7 / 30 天趋势
- 浅色 / 深色 / 跟随系统
- 修改密码、记住密码、自动登录
- PWA 安装、自动更新、更新成功提示
- 匿名使用统计后端 + 统计页面

## 先说明限制

- **只支持 4G 水表**，不做 BLE 蓝牙表。
- 充值没有接入，余额不足请走趣智校园官方渠道。
- iPhone / iOS 的传感器权限、静音键、后台限制比 Android 多；首次使用需要按提示授权。
- 没有自建业务服务器。登录、余额、设备、开关阀、账单请求由浏览器直接发往趣智校园 API。
- 本应用不参与收费、退款、设备运维。

## 目录

```text
pwa/       React + Vite PWA 前端
server/    Python + SQLite 匿名统计后端
```

## 前端开发

要求 Node.js 22+、pnpm。

```bash
cd pwa
pnpm install
pnpm dev
```

构建：

```bash
pnpm build
```

产物在 `pwa/dist/`，是纯静态文件。

### 环境变量

```bash
VITE_API_BASE_URL=https://v3-api.china-qzxy.cn
VITE_STATS_URL=
```

- `VITE_API_BASE_URL`：趣智校园 API 地址，保持直连，不要反代成 `/api`。
- `VITE_STATS_URL`：统计后端地址，可留空。
- 部署后也可以直接修改 `dist/runtime-config.js`：

```js
window.__LINYU_STATS_URL__ = 'https://stats.example.com'
```

修改后不需要重新构建。

## 前端部署

`pwa/dist` 可以部署到：

- 1Panel 静态网站
- Cloudflare Pages
- Nginx / OpenResty
- 任意 HTTPS 静态托管

要求：

- 必须 HTTPS（摄像头、Wake Lock、PWA 需要）
- 根路径部署（manifest 的 `start_url` 是 `/`）
- 配置 SPA fallback 到 `index.html`
- 不要把趣智校园 API 做成反向代理，避免源 IP 变化导致会话异常

## 匿名统计后端

当前实现对数据库和部署环境要求很低：

- Python 3.12 标准库
- SQLite
- 无外部 Python 依赖
- 自带统计页 `/stats`

### 从源码启动

```bash
cd server
cp .env.example .env
# 编辑 STATS_TOKEN / ALLOWED_ORIGINS
docker compose up -d --build
```

默认：

- 宿主机端口 `8787`
- 统计页 `http://服务器:8787/stats`
- 数据卷 `stats-data`

### 从镜像启动

GitHub Release `v1.0.0` 已发布：

```bash
docker pull ghcr.io/small-saltedfish/linyu-pwa-stats:1.0.0
```

`server/docker-compose.release.example.yml` 是固定镜像版本的示例。

### 环境变量

| 变量 | 说明 |
|---|---|
| `PORT` | 容器端口，默认 8080 |
| `DB_PATH` | SQLite 路径，默认 `/data/stats.db` |
| `ALLOWED_ORIGINS` | 允许的前端来源，逗号分隔 |
| `STATS_TOKEN` | 统计页 API token，可选但建议设置 |

### 反向代理

1Panel / Nginx 将：

```text
https://stats.example.com → http://127.0.0.1:8787
```

不要直接把 8787 暴露到公网。

## 匿名统计说明

前端固定开启匿名统计，不提供用户关闭开关。

上报内容仅限：

- 随机 `installId`
- 事件名（打开、扫码、开阀、暂停、继续、结束、安装）
- 项目 id / 名称
- 粗粒度地区（Cloudflare 头）
- 时间、时长

不上报：

- 手机号
- accountId / userId
- loginCode / 密码
- 设备 MAC / 订单号
- 精确 GPS

完整声明见应用内 `/#/terms` 和 `/#/privacy`。

## 版本与发布

当前版本：`v1.0.0`

发布时：

- Git tag：`v1.0.0`
- 前端 Release 附件：只放构建产物 `linyu-pwa-web-v1.0.0.zip`
- 后端镜像：只发 GHCR，标签 `1.0.0`、`1.0`，正式版可加 `latest`
- 后端镜像不打进 Release 附件，使用 registry 拉取
- 不额外放 SHA256 校验文件
- workflow：`.github/workflows/release.yml`，只有推 `v*` tag 才触发

每次发版同步更新：

- `pwa/package.json`
- `pwa/src/lib/version.ts`
- 关于页自动读取 `APP_VERSION`

## 常用命令

```bash
cd pwa
pnpm lint
pnpm build
```

```bash
cd server
python3 -m py_compile app.py
docker compose up -d --build
```

## 已知限制

- Android / iOS 的后台能力、传感器权限回收策略差异较大
- iOS 静音键可能压掉音效；Web Audio 在息屏后可能需要一次触摸恢复
- 自动更新做了 5 分钟单次刷新保护，避免刷新循环
- 统计后端是最小实现，适合小规模使用；大规模建议换 Postgres / Worker + D1

## 开源项目

- [React](https://github.com/facebook/react)
- [React Router](https://github.com/remix-run/react-router)
- [Zustand](https://github.com/pmndrs/zustand)
- [Vite](https://github.com/vitejs/vite)
- [vite-plugin-pwa](https://github.com/vite-pwa/vite-plugin-pwa)
- [Workbox](https://github.com/GoogleChrome/workbox)
- [lucide-react](https://github.com/lucide-icons/lucide)
- [jsQR](https://github.com/cozmo/jsQR)
- [淋浴 linyu](https://github.com/yehu-imei/linyu)

## License

MIT
