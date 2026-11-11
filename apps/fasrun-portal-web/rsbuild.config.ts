import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

export default defineConfig({
  plugins: [pluginReact()],
  source: { entry: { index: './src/web/index.tsx' } },
  html: { title: 'Fasrun 帆驭', mountId: 'root' },
  output: { distPath: { root: 'dist/web' } },
});
