/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        space: {
          950: '#060911',
          900: '#0b111e',
          850: '#101828',
          800: '#162035',
          700: '#1f2e4d',
          600: '#2d426d',
        },
        solar: {
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
        },
        earth: {
          400: '#38bdf8',
          500: '#0284c7',
          600: '#0369a1',
        },
        lunar: {
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
        }
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
