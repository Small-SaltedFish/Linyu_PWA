# Linyu_PWA

一个无广告的趣智校园 PWA 客户端，附带匿名使用统计后端。

> 第三方非官方项目，与趣智校园官方、学校及设备运营方无隶属关系。金钱、设备、服务问题请找趣智校园官方。

## 组成

- `pwa/`：React + Vite PWA，扫码用水、结算、自动翻转开关水、使用记录、协议页面。
- `server/`：Python stdlib + SQLite 匿名统计后端，Docker 部署，自带统计页。

## 前端

```bash
cd pwa
pnpm install
pnpm dev
pnpm build
```

环境变量：

```bash
VITE_API_BASE_URL=https://v3-api.china-qzxy.cn
VITE_STATS_URL=https://stats.example.com
```

- 真实 API 直连，不反代。
- `VITE_STATS_URL` 留空则完全不上报统计；部署后也可修改 `dist/runtime-config.js` 的 `window.__LINYU_STATS_URL__`。
- 演示模式只放在 `/#/debug`，不在正常导航显示。

## 统计后端

```bash
cd server
docker compose up -d --build
```

默认 `8787` 端口，统计页 `/stats`，健康检查 `/health`。

只接收：

- 随机匿名 `installId`
- 事件（打开、扫码、开阀、暂停、继续、结束、安装）
- 项目 id / 名称
- 粗粒度地区（Cloudflare 头，可选）
- 时间、时长

**不接收**手机号、accountId、loginCode、密码、设备 MAC、订单号、精确 GPS。前端「我的」可关闭匿名统计。

详细说明见 [`server/README.md`](server/README.md)。

## 协议

用户协议和隐私政策在应用内 `/#/terms`、`/#/privacy`，也可在登录页和关于页进入。

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
