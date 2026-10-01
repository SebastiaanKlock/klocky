import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: { maximumFileSizeToCacheInBytes: 5_000_000 },
      manifest: {
        name: 'Klocky',
        short_name: 'Klocky',
        description: 'Prijslijsten vergelijken en facturen maken',
        lang: 'nl',
        display: 'standalone',
        start_url: './',
        background_color: '#1b2036',
        theme_color: '#1b2036',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
});
