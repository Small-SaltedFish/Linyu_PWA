/** 趣智校园微信小程序的明文 URL Scheme（官方已开启明文 Scheme） */
export const WECHAT_RECHARGE_SCHEME =
  'weixin://dl/business/?appid=wx2ded7c2a06ef15ea&path=pages/index/index&env_version=release'

const DIRECT_COOKIE = 'linyu_recharge_direct'

/** 用户勾选“以后直接跳转”后，一年内不再弹说明 */
export function hasRechargeDirectCookie(): boolean {
  try {
    return document.cookie
      .split(';')
      .map((part) => part.trim())
      .some((part) => part === `${DIRECT_COOKIE}=1`)
  } catch {
    return false
  }
}

export function rememberRechargeDirect() {
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${DIRECT_COOKIE}=1; Max-Age=31536000; Path=/; SameSite=Lax${secure}`
}

export function jumpToWeChatRecharge() {
  window.location.href = WECHAT_RECHARGE_SCHEME
}
