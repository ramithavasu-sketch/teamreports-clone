import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/teamreports-clone/',
  // Two pages: Team Reports, and Call Calibration on its own link (/call-calibration/).
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        calibration: 'call-calibration/index.html',
      },
    },
  },
})
