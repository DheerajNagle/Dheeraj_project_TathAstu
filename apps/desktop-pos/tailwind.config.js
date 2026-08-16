/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fdf8f6',
          100: '#f2e8e5',
          500: '#e0533c',
          600: '#c2412b',
          700: '#a3321f',
        }
      }
    },
  },
  plugins: [],
}
