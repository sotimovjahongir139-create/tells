import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        gray: {
          950: '#0a0f1e',
        },
      },
    },
  },
  plugins: [],
};

export default config;
