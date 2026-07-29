/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        primary: {
          50: '#fdf4ff',
          100: '#fae8ff',
          200: '#f5d0fe',
          300: '#f0abfc',
          400: '#e879f9',
          500: '#d946ef',
          600: '#c026d3',
          700: '#a21caf',
          800: '#86198f',
          900: '#701a75',
        },
        accent: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
        slate: {
          950: '#0a0f1e',
        },
      },
      boxShadow: {
        card: '0 1px 3px 0 rgba(0,0,0,0.06), 0 1px 2px -1px rgba(0,0,0,0.04)',
        'card-hover': '0 4px 12px 0 rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.06)',
        'glow-purple': '0 0 20px rgba(192,38,211,0.25)',
      },
      borderRadius: {
        xl: '12px',
        '2xl': '16px',
      },
      backgroundImage: {
        'gradient-sidebar': 'linear-gradient(160deg, #1e1b4b 0%, #312e81 40%, #4c1d95 100%)',
        'gradient-page': 'linear-gradient(135deg, #f8f4ff 0%, #eff6ff 50%, #f0fdf4 100%)',
      },
    },
  },
  plugins: [],
};
