import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    build: {
      target: ['es2015', 'chrome60'], // Modern JS özelliklerini (Optional chaining, nullish coalescing vb.) eski ES6 standartlarına dönüştürür. Android System WebView Chrome 60 motoru kapsamında.
      cssTarget: 'chrome60', // Modern CSS kurallarını eski motorlar için güvenli hale getirir
      minify: 'terser', // Eski tarayıcılarda daha kararlı çalışan sıkıştırma yöntemi
      terserOptions: {
        compress: {
          drop_console: true, // Performans için console.log'ları temizler
        }
      }
    },
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
