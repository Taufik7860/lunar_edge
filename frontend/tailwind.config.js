/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        obsidian: {
          950: '#030508',
          900: '#070A10',
          850: '#0B0F18',
          800: '#101622',
        },
        graphite: {
          900: '#0F141F',
          850: '#141B2A',
          800: '#1A2336',
          700: '#243048',
          600: '#324262',
        },
        cyan: {
          400: '#00E5FF',
          500: '#00B4D8',
          600: '#0077B6',
        },
        amber: {
          400: '#FBBF24',
          500: '#F59E0B',
          600: '#D97706',
        },
        crimson: {
          400: '#F87171',
          500: '#EF4444',
          600: '#DC2626',
        },
        emerald: {
          400: '#34D399',
          500: '#10B981',
          600: '#059669',
        },
        silver: {
          300: '#CBD5E1',
          400: '#94A3B8',
          500: '#64748B',
          600: '#475569',
        },
        space: {
          950: '#030508',
          900: '#070A10',
          850: '#0B0F18',
          800: '#101622',
          700: '#1A2336',
          600: '#243048',
        },
        solar: {
          400: '#FBBF24',
          500: '#F59E0B',
          600: '#D97706',
        },
        earth: {
          400: '#00E5FF',
          500: '#00B4D8',
          600: '#0077B6',
        },
        lunar: {
          300: '#CBD5E1',
          400: '#94A3B8',
          500: '#64748B',
        }
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        'aerospace': '0 0 0 1px rgba(0, 229, 255, 0.15), 0 4px 20px -2px rgba(0, 0, 0, 0.8)',
        'cyan-glow': '0 0 15px -2px rgba(0, 229, 255, 0.3)',
        'amber-glow': '0 0 15px -2px rgba(245, 158, 11, 0.3)',
      }
    },
  },
  plugins: [],
}
