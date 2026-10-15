import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: './',
  plugins: [
    react(), tailwindcss(),
    {
      name: 'local-development-csp',
      transformIndexHtml: {
        order: 'post',
        // React Fast Refresh injects an inline module in development only.
        handler: (html, context) => context.server ? html.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'") : html,
      },
    },
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { host: '127.0.0.1', port: 5178, strictPort: true },
})
