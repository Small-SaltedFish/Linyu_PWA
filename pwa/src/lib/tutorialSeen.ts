const TUTORIAL_SEEN_COOKIE = 'linyu_auto_tutorial_seen'

export function hasSeenAutoTutorial(): boolean {
  try {
    return document.cookie
      .split(';')
      .map((part) => part.trim())
      .some((part) => part === `${TUTORIAL_SEEN_COOKIE}=1`)
  } catch {
    return false
  }
}

export function markAutoTutorialSeen() {
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${TUTORIAL_SEEN_COOKIE}=1; Max-Age=31536000; Path=/; SameSite=Lax${secure}`
}
