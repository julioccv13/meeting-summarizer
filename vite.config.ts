import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: process.env.BASE_URL || '/',
  plugins: [react()],
  server: { port: 5173 },
  build: { target: 'es2020' }
})
