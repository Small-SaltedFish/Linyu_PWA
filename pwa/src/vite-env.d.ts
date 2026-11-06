/// <reference types="vite-plugin-pwa/client" />

/// <reference types="vite/client" />

interface Window {
  __LINYU_STATS_URL__?: string
}

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_DEMO_MODE?: string
  readonly VITE_STATS_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
