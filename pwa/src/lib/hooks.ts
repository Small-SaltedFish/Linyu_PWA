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

export function useInstallPrompt() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null)
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
    if (choice.outcome === 'accepted') setInstalled(true)
    setPromptEvent(null)
    return choice.outcome === 'accepted'
  }

  const ua = navigator.userAgent
  const isIos =
    /iphone|ipad|ipod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  // iOS 上的 Chrome / Edge / Firefox / 微信内置浏览器都不能真正安装 PWA；
  // 只有 Safari 的「添加到主屏幕」会创建独立 Web App。
  const isSafari =
    isIos &&
    /Safari/i.test(ua) &&
    !/(CriOS|FxiOS|EdgiOS|OPiOS|GSA|DuckDuckGo|MicroMessenger|FBAN|FBAV|Instagram)/i.test(ua)
  return { canInstall: Boolean(promptEvent), installed, install, isIos, isSafari }
}
