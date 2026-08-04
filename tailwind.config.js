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
          ink: '#1a1f1c',
          accent: '#0e5a46',
          warn: '#b45309',
          danger: '#b42318',
        },
      },
      fontFamily: {
        sans: ['var(--font-ibm-plex-arabic)', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [require('tailwindcss-rtl')],
}
