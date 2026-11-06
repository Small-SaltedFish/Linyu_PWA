/**
 * 吹风机暂时不适配（2026-11-02 起默认关闭）。
 *
 * 现场确认设备在线、套餐/下单接口可用后，在 `.env` 里设置
 * `VITE_ENABLE_DRYER=true` 即可恢复（需要重启 dev server）。
 * 代码路径都保留，不做删除。
 */
export const DRYER_ENABLED = (import.meta.env.VITE_ENABLE_DRYER ?? 'false') === 'true'
