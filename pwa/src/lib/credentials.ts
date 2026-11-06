export interface SavedCredentials {
  phone: string
  passwordHash: string
  remember: boolean
  autoLogin: boolean
}

const KEY = 'linyu_login_credentials'

export function readCredentials(): SavedCredentials | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<SavedCredentials>
    if (
      typeof parsed.phone !== 'string' ||
      typeof parsed.passwordHash !== 'string' ||
      !parsed.phone ||
      !parsed.passwordHash
    ) {
      return null
    }
    return {
      phone: parsed.phone,
      passwordHash: parsed.passwordHash,
      remember: parsed.remember !== false,
      autoLogin: parsed.autoLogin === true,
    }
  } catch {
    return null
  }
}

export function saveCredentials(value: SavedCredentials) {
  try {
    localStorage.setItem(KEY, JSON.stringify(value))
  } catch {
    // ignore quota/private mode
  }
}

export function clearCredentials() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}
