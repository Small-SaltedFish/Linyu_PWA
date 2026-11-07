# 淋浴 No-Ads · 部署备忘

产物：`pwa/dist/`（纯静态，HashRouter，不需要 SPA rewrite）。
最低要求：**HTTPS**。Wake Lock、Service Worker、PWA 安装在 HTTP/IP 下都不可用。

## 0. API：直连，不反代

当前策略：**浏览器直接请求 `https://v3-api.china-qzxy.cn`，不做 `/api` 反代。**

原因：反代会让服务端看到的源 IP 变成服务器/Worker 的 IP，可能影响服务端的 IP/会话校验；
另外 GET 的 `loginCode` 会经过代理，日志泄露面更大。

```bash
# pwa/.env.production（或构建时注入）
VITE_API_BASE_URL=https://v3-api.china-qzxy.cn
```

前提：目标域名的 CORS/预检放行。上线前用部署后的域名实际登录一次验证；
如果以后 CORS 收紧，再评估反代，但要接受源 IP 变化的风险（或找服务端支持 `X-Forwarded-For`）。

---

## 1. 云服务器 + 1Panel（国内服务器需备案）

1. **域名**：A 记录指向服务器公网 IP。国内服务器走 80/443 必须完成 ICP 备案，否则会被云厂商拦截。
2. **建站**：1Panel → 网站 → 创建网站 → 选择「静态网站」/OpenResty → 填域名。
3. **上传**：本地 `cd pwa && pnpm build`，把 `dist/` 里的内容（不是 dist 目录本身）传到 1Panel 站点根目录。
4. **HTTPS**：网站 → HTTPS → Let's Encrypt 申请证书 → 开启强制 HTTPS；放行安全组/防火墙 80、443。
5. **Nginx**：网站 → 配置，把 [`nginx.conf.example`](nginx.conf.example) 里的静态缓存/安全头合进去；**不要加 `/api` 反代**。1Panel 的站点根目录/证书路径以实际为准。
6. **验证**：
   ```bash
   curl -I https://你的域名/
   curl -I https://你的域名/sw.js        # 应为 no-cache
   curl -I https://你的域名/assets/xxx.js # 应为 immutable
   ```
7. **更新**：重新 build → 覆盖站点目录即可；`index.html`/`sw.js` 不缓存，`assets` 带 hash 可长期缓存。

> 不想备案：用香港/海外 VPS（延迟高一些），或 Cloudflare Pages（见下）。

---

## 2. Cloudflare Pages（不想备案/最快上线）

1. 推 Git 仓库，CF Pages → Connect Git：
   - Root directory：`pwa`
   - Build command：`pnpm build`
   - Output directory：`dist`
   - 环境变量：`VITE_API_BASE_URL=https://v3-api.china-qzxy.cn`（直连，不要用 `/api`）。
2. 或者手动上传：
   ```bash
   cd pwa && pnpm build
   npx wrangler pages deploy dist --project-name=linyu
   ```
3. 自定义域名 + HTTPS：CF 自动签发。
4. `public/_headers` 会被复制到 `dist/_headers`，CF Pages 自动应用缓存/CSP/权限策略。
5. **不要用 Pages Functions/Worker 反代 API**：会把源 IP 变成 CF 节点 IP；
   直连官方 API 即可。CDN 只加速静态文件。
6. 国内访问：CF 海外节点，速度和稳定性不如国内 CDN；且 CF 中国大陆网络需要企业版 + 备案。

---

## 2.1 1Panel/Nginx 前面又套了 Cloudflare

Cloudflare 默认会按扩展名缓存 `.js`，可能把 `/sw.js` 缓存 31 天，导致上传新版本后浏览器仍拿旧 Service Worker。

必须：

1. Cloudflare → Caching → Cache Rules 增加：
   - URI Path equals `/sw.js` → Bypass cache
   - URI Path equals `/index.html` → Bypass cache
2. 每次发布后 Purge Cache：
   - `https://你的域名/sw.js`
   - 必要时整个域名
3. 验证：

```bash
curl -I https://你的域名/sw.js | grep -i cache
```

不能出现 `cf-cache-status: HIT` + `max-age=2678400`。

`public/_headers` 只对 Cloudflare Pages 生效；1Panel/Nginx 源站需要单独在 Cloudflare 配 Cache Rule。

## 3. 国内 CDN / 对象存储

1. 对象存储（阿里 OSS / 腾讯 COS）开启静态网站，上传 `dist/`，默认首页 `index.html`。
2. 绑定已备案域名，开启 CDN，HTTPS 证书用 CDN 托管证书。
3. 缓存规则：
   - `/index.html`、`/sw.js`、`/manifest.webmanifest`：不缓存/短缓存；
   - `/assets/*`：长缓存（带 hash，可 immutable）；
   - 图片/图标：按需。
4. 回源到 OSS/COS；API 不经过 CDN，浏览器直连官方 API。
5. 国内 CDN 基本都要求域名备案；海外 CDN 不需要，但国内速度一般。

---

## 4. 其它平台

- GitHub Pages：HashRouter 可直接用；**没有**服务端反代，只能直连 API；仓库子路径部署要改
  `vite.config.ts` 的 `base` 和 manifest 的 `start_url/scope`，建议用独立子域名。
- Vercel / Netlify：配置同上（build `pnpm build`，output `dist`），国内访问一般。
- Nginx 反代 + 任意静态托管都可以组合。

## 5. 上线检查

- [ ] HTTPS 可访问，证书有效
- [ ] `/sw.js` 返回 `Cache-Control: no-cache`
- [ ] `/assets/*` 返回长缓存
- [ ] 登录、项目切换、扫码、开阀、结束结算、账单全部走通
- [ ] 使用页显示「已保持屏幕常亮」（必须 HTTPS）
- [ ] 双指缩放被禁止
- [ ] 关闭页面/重开，登录态恢复；`errorCode 8` 能回登录页
- [ ] 部署域名直连 API 的 CORS/预检正常（登录一次验证）
- [ ] CSP `connect-src` 包含 `https://v3-api.china-qzxy.cn`
- [ ] 没有配置 `/api` 反代（避免源 IP 变化）
