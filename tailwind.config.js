/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts}'],
  theme: {
    extend: {
      colors: {
        // Light theme — nền xám trắng nhẹ, primary là xanh dương.
        // Tên giữ "binance-*" để không phải đụng class trong toàn bộ template:
        //   binance-yellow = primary (blue), giữ tên cũ cho tiện.
        binance: {
          yellow: '#2563eb', // primary (blue-600) — CTA / accent
          dark: '#e9eef5',   // light surface phụ (chips, ô readonly)
          gray: '#f7f9fc',   // surface (cards) — trắng ngà, đỡ chói
          light: '#dbe2ec',  // border / hover
        },
      },
      backgroundImage: {
        // Spotlight glow nhẹ ở top — dùng trên body (light)
        'app-bg': `radial-gradient(ellipse 80% 50% at 50% -10%, rgba(37,99,235,0.06), transparent 70%)`,
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
