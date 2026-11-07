import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import { copyFileSync } from 'node:fs'
import { VitePWA } from 'vite-plugin-pwa'

function copyStandaloneTutorial(): Plugin {
  return {
    name: 'copy-standalone-tutorial',
    closeBundle() {
      copyFileSync('tutorial-demo.html', 'dist/tutorial-demo.html')
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: '淋浴 No-Ads',
        short_name: '淋浴 No-Ads',
        description: '淋浴 No-Ads：扫码绑定 4G 水表，查看余额、开关水和使用记录。',
        theme_color: '#f4f6fb',
        background_color: '#f4f6fb',
        display: 'standalone',
        orientation: 'portrait',
        lang: 'zh-CN',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/icons/maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/tutorial-demo\.html$/],
        cleanupOutdatedCaches: true,
        clientsClaim: false,
        skipWaiting: false,
      },
      devOptions: {
        enabled: false,
      },
    }),
    copyStandaloneTutorial(),
  ],
})
