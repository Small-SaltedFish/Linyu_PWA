# 淋浴 No-Ads · LinYu PWA

基于 [yehu-imei/linyu](https://github.com/yehu-imei/linyu) API 逆向成果的 PWA 原型。

> **当前范围：4G 水表。** 吹风机暂时不适配（2026-11-02 起默认隐藏），代码保留；不做 BLE。
> 实地确认可用后在 `.env` 设 `VITE_ENABLE_DRYER=true` 恢复，并重启 dev server。

**真实水表已接入**：登录（密码/短信）、会话持久化、项目选择、余额、扫码/设备、开关水、结算、账单都走真实趣智校园 API。登录页仍保留「先体验演示」入口，只用于看 UI，不发真实请求。

> 屏幕常亮（Wake Lock）需要 HTTPS 或 localhost；局域网 `http://IP` 打不开。
> 吹风机暂时隐藏（`VITE_ENABLE_DRYER=false`）。

另有一个 **仅开发环境可见的 M0 联调页** `/#/spike`：直连真实趣智校园 API，用来验证登录、项目切换、余额、设备、开关水与结算。它会真的放水、真的扣费，登录页底部有入口。

定时策略：**开发构建默认 180 秒自动关阀**（防调试忘关水）；**生产构建自动改为只提醒、不自动关阀**（`AUTO_CLOSE_ENABLED = import.meta.env.DEV`）。自动关阀依赖页面定时器，关页/断网后不会执行。

## 预览

| 首页 | 登录 | 使用中 |
|---|---|---|
| ![首页](screenshots/home.png) | ![登录](screenshots/login.png) | ![使用中](screenshots/shower.png) |

| 扫码 | 记录 | 我的 |
|---|---|---|
| ![扫码](screenshots/scan.png) | ![记录](screenshots/records.png) | ![我的](screenshots/profile.png) |

M0 真机联调页（开发环境入口，会真实开关水）：

![M0 Spike](screenshots/spike.png)

## 快速开始

```bash
pnpm install
pnpm dev
```

打开终端输出的地址（默认 http://localhost:5173）。

生产构建：

```bash
pnpm build
pnpm preview
```

## 当前已实现

- 登录页：真实密码/短信登录、会话持久化、失效提示、演示入口、PWA 安装提示、DEV 环境 M0 入口
- 姓名：服务端可能不返回姓名，界面统一显示手机号（脱敏）
- M0 Spike 页：真实登录、项目列表/切换、余额、设备、queryUsing 三态、downRate/closeOrder/consume、账单、脱敏报告导出
- 首页：真实钱包余额、**项目切换**、常用设备、使用中卡片、最近消费
- 余额只展示趣智校园钱包（本校唯一账户，不做一卡通/校园账户）
- 扫码：相机扫码 + 相册识别 + 手动 MAC；真实模式查 `/device/info/mac`，演示模式用演示设备
- 设备详情：水表（吹风机暂时隐藏，开关见上）
- 使用页：计时、预扣金额、**屏幕常亮（Wake Lock）**、结束确认（closeOrder → queryUsing → consume）、账单结果
- 记录：真实账单（按项目）、筛选、7 天趋势、账单详情
- 项目：一个账号可能有多个项目（洗浴/吹风机/洗衣…，各自独立钱包），M0 页可切换
- 我的：账号、外观、PWA 安装、关于、退出
- PWA：manifest、Service Worker、离线壳、图标
- 移动端：禁止双指缩放；深色模式；`prefers-reduced-motion`

## 部署

构建产物在 `dist/`，可直接放到 Cloudflare Pages / Netlify / GitHub Pages / 1Panel + Nginx 等静态托管。

项目使用 `HashRouter`（URL 形如 `/#/records`），因此**不需要配置 SPA rewrite**；任何静态托管都能直接打开。

详细步骤（1Panel / Cloudflare Pages / 国内 CDN、直连 API、缓存和安全头）见
[`deploy/README.md`](deploy/README.md)；Nginx 配置模板见
[`deploy/nginx.conf.example`](deploy/nginx.conf.example)，CF Pages 的 `_headers` 在 `public/_headers`。

> 必须 HTTPS：Wake Lock、Service Worker、PWA 安装在 HTTP/IP 下不可用。
> **API 直连，不反代**：反代会改变服务端看到的源 IP，可能影响 IP/会话校验。
> 构建使用 `VITE_API_BASE_URL=https://v3-api.china-qzxy.cn`。

## 设计方向

- 扁平、留白、低饱和背景 + 克制的渐变
- Argon 风格的圆角卡片、软阴影、蓝紫主色（`#5e72e4 → #825ee4`）
- 移动优先，最大宽度 480px；桌面显示为居中 App 壳
- 支持深色模式与 `prefers-reduced-motion`

## 目录

```text
src/
├─ api/          # 趣智校园 API client 骨架（当前未接真实请求）
├─ components/   # BrandMark / DeviceGlyph / BottomNav / Sheet / Toast
├─ data/         # 演示用户、设备、账单
├─ lib/          # QR 解析、格式化、hooks
├─ pages/        # Login / Home / Scan / Shower / Records / Profile
├─ store/        # Zustand：会话、订单、账单、设置
└─ styles.css    # 设计系统与全部页面样式
```

## 下一步

- 真机回归：登录持久化/过期、项目切换、扫码开阀、关阀结算、账单、屏幕常亮
- 错误态细化：网络中断、设备占用、关阀未确认的 UI 文案
- 外观支持浅色/深色/跟随系统；记录页按天折叠并汇总，顶部今日热水消费，支持近 7/30 天趋势；自动翻转开关水默认关闭；扫码页 cookie 或使用页开关启用。扣下暂停、正面平放继续、拿起 3 秒结束；每次操作 3s CD，每单首次 15s 保护；页面隐藏/锁屏只退出自动模式，不动阀门。见 `/#/tilt` 和 Spike「预扣/退款测试」。
- 吹风机：实地确认后设 `VITE_ENABLE_DRYER=true`，先验证 `/device/mode/list` 和 `downRate/modeOrder`
- 充值/后台仍不做；关阀确认继续用 `queryUsing` 三态。账号安全只做修改密码；密码登录支持记住密码/自动登录（本地存 hash，退出清除）。调试入口 `/#/debug`，演示模式只在调试页；登录页/我的不再显示调试和演示入口。扫码页锁滚动；协议/隐私在 `/terms`、`/privacy`；触感已全部移除；安装只保留「我的 → 一键安装」，不再主动弹安装条。
- 安全：生产加 CSP、禁第三方脚本、退出清理 localStorage 里的 loginCode

## 说明

非趣智校园官方应用，仅供学习与校园生活服务。生产接入前请确认学校/服务商授权、隐私与支付合规。

项目接口与切换语义来自 [yehu-imei/linyu](https://github.com/yehu-imei/linyu) 的 PR #12 与 `API-qzxy.md`；本地 master 尚未包含该 PR。
