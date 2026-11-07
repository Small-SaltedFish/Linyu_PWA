import { useEffect, useState } from 'react'

export function useElapsed(startedAt?: number): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!startedAt) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [startedAt])

  if (!startedAt) return 0
  return Math.max(0, Math.floor((now - startedAt) / 1000))
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

// Chrome 可能在 React 首次挂载前就抛出 beforeinstallprompt。
// 尽早接住，避免「我的」页面晚一步监听导致事件丢失、只剩「浏览器菜单」。
let earlyInstallPrompt: BeforeInstallPromptEvent | null = null
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    earlyInstallPrompt = event as BeforeInstallPromptEvent
  })
}

export function useInstallPrompt() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(
    () => earlyInstallPrompt,
  )
  const [installed, setInstalled] = useState(
    () => window.matchMedia('(display-mode: standalone)').matches,
  )

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault()
      setPromptEvent(event as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      earlyInstallPrompt = null
      setPromptEvent(null)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const install = async () => {
    if (!promptEvent) return false
    await promptEvent.prompt()
    const choice = await promptEvent.userChoice
    earlyInstallPrompt = null
    if (choice.outcome === 'accepted') setInstalled(true)
    setPromptEvent(null)
    return choice.outcome === 'accepted'
  }

  const ua = navigator.userAgent
  const isIos =
    /iphone|ipad|ipod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const isSafari =
    isIos &&
    /Safari/i.test(ua) &&
    !/(CriOS|FxiOS|EdgiOS|OPiOS|GSA|DuckDuckGo|MicroMessenger|FBAN|FBAV|Instagram)/i.test(ua)
  const isIosChrome = isIos && /CriOS/i.test(ua)
  const isAndroid = /Android/i.test(ua)
  const isInAppBrowser = /MicroMessenger|FBAN|FBAV|Instagram/i.test(ua)
  return {
    canInstall: Boolean(promptEvent),
    installed,
    install,
    isIos,
    isSafari,
    isIosChrome,
    isAndroid,
    isInAppBrowser,
  }
}
