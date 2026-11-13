import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    // 在容器裡要監聽所有介面，瀏覽器才連得進來
    host: '0.0.0.0',
    port: 3020,
    strictPort: true,
    // Windows 資料夾掛進容器時收不到檔案變更通知，改用輪詢偵測
    watch: {
      usePolling: true,
    },
    // 開發時 /api 開頭的請求轉給 api 容器，對瀏覽器來說是同一個來源，不需要 CORS
    proxy: {
      '/api': 'http://api:3000',
    },
  },
})
