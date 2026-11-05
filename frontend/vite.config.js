import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    // Stamped in at build time so a deployed page can prove which build it is.
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
});
