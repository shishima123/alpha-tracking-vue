/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts}'],
  theme: {
    extend: {
      colors: {
        binance: {
          yellow: '#F0B90B',
          dark: '#0B0E11',
          gray: '#1E2329',
          light: '#2B3139',
        },
      },
    },
  },
  plugins: [],
};
