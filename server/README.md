# Linyu PWA Stats

匿名使用统计后端。只接收事件、项目信息、粗粒度地区和时间，**不接收手机号、accountId、loginCode、密码、设备 MAC 或订单号**。

## 运行

```bash
docker compose up -d --build
```

默认：

- 端口：`8787`（容器内 `8080`）
- 数据：Docker volume `stats-data` → `/data/stats.db`
- 统计页：`http://localhost:8787/stats`
- 健康检查：`http://localhost:8787/health`

`.env` / compose 环境变量：

| 变量 | 说明 |
|---|---|
| `PORT` | 容器端口，默认 8080 |
| `DB_PATH` | SQLite 路径，默认 `/data/stats.db` |
| `ALLOWED_ORIGINS` | 允许的前端来源，逗号分隔；默认 `*` |
| `STATS_TOKEN` | 可选；设置后 `/api/stats` 需要 `X-Stats-Token` 或 `?token=` |

## 前端配置

前端构建时设置：

```bash
VITE_STATS_URL=https://stats.example.com
```

然后重新构建 PWA；也可以部署后直接修改 `dist/runtime-config.js` 里的 `window.__LINYU_STATS_URL__`，无需重新构建。统计页在 `https://stats.example.com/stats`。

前端固定开启匿名统计，不提供关闭开关。

## API

### `POST /api/events`

```json
{
  "events": [
    {
      "installId": "随机 UUID",
      "event": "water_start",
      "projectId": "1234",
      "projectName": "示例学校",
      "appVersion": "0.1.0",
      "durationSec": 0
    }
  ]
}
```

允许的事件：`app_open`、`scan_success`、`water_start`、`water_pause`、`water_resume`、`water_end`、`install`。

### `GET /api/stats?days=7`

返回总数、独立设备、事件计数、每日趋势、项目分布和地区分布。

## 地理信息

默认从 Cloudflare 的 `CF-IPCountry` / `CF-Region` / `CF-IPCity` 读取粗粒度地区，不保存 IP。
如果没有 Cloudflare 头，地区会显示为未知；不要为了统计请求浏览器 GPS。

## 数据库

`events` 表：`install_id`、`event`、`project_id`、`project_name`、`country`、`region`、`city`、`app_version`、`duration_sec`、`created_at`。
