import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  site: 'https://MaximusPrime.github.io',
  base: '/ClipBoardPrime',
  integrations: [tailwind()],
});
