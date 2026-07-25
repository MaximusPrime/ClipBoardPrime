import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://MaximusPrime.github.io',
  base: '/ClipBoardPrime',
  vite: {
    plugins: [tailwindcss()],
  },
});
