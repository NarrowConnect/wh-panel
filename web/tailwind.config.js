/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#07080c',
        surface: {
          DEFAULT: '#0e1017',
          card: '#12141c',
          hover: '#181b26',
          border: 'rgba(255, 255, 255, 0.07)',
          borderHover: 'rgba(255, 255, 255, 0.15)',
        },
        brand: {
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
          950: '#2e1065',
        },
        lavender: {
          300: '#d8b4fe',
          400: '#c084fc',
          500: '#a855f7',
        },
        dark: {
          800: '#161822',
          850: '#11131a',
          900: '#0c0d14',
          950: '#07080c',
        }
      },
      fontFamily: {
        sans: ['Satoshi', 'system-ui', '-apple-system', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
