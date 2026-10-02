import { defineConfig } from 'vite';
export default defineConfig({
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    lib: { entry: 'src/content.tsx', name: 'HbhrTeamLeave', formats: ['iife'], fileName: () => 'content.js' },
    sourcemap: false, emptyOutDir: true,
  },
});