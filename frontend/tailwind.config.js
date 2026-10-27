/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Brand turquoise, from the logo (300 = logo cyan, 500 = logo teal).
        primary: {
          50: '#effcfd',
          100: '#d5f6f9',
          200: '#aeedf2',
          300: '#5ce1e6',
          400: '#2cc8d4',
          500: '#00a4ba',
          600: '#007f91',
          700: '#006878',
          800: '#0b5463',
          900: '#0d4552',
        },
        // Brand navy, from the logo (900 = logo navy).
        navy: {
          50: '#f1f4f9',
          100: '#e1e7f0',
          200: '#c3cfe0',
          300: '#95a7c4',
          400: '#6079a0',
          500: '#3f5980',
          600: '#2b4468',
          700: '#1d3353',
          800: '#13294d',
          900: '#0a1e3c',
          950: '#061328',
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
        'glow-brand': '0 0 20px rgba(0,164,186,0.25)',
      },
      borderRadius: {
        xl: '12px',
        '2xl': '16px',
      },
      backgroundImage: {
        'gradient-sidebar': 'linear-gradient(160deg, #0a1e3c 0%, #0f2547 55%, #13294d 100%)',
        'gradient-page': 'linear-gradient(135deg, #f1f7f9 0%, #f4f5f7 50%, #f4f3f1 100%)',
        'gradient-brand': 'linear-gradient(135deg, #0a1e3c 0%, #13294d 100%)',
      },
    },
  },
  plugins: [],
};
