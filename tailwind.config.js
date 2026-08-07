/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        ab: {
          bg: '#f6f7f6',
          surface: '#ffffff',
          border: '#e2e5e3',
          hairline: '#edefee',
          ink: '#1a1f1c',
          accent: '#0e5a46',
          muted: '#4f5853',
          warn: '#b45309',
          danger: '#b42318',
          stage: '#eef1ef',
        },
      },
      borderRadius: {
        ab: '0.625rem',
        'ab-lg': '0.875rem',
      },
      boxShadow: {
        ab: '0 8px 24px rgba(26, 31, 28, 0.08)',
        'ab-sm': '0 1px 2px rgba(26, 31, 28, 0.04)',
      },
      fontFamily: {
        sans: ['var(--font-ibm-plex-arabic)', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [require('tailwindcss-rtl')],
}
