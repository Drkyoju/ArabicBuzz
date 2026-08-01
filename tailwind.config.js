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
          bg: '#f8f7f4',
          surface: '#ffffff',
          border: '#e5e2da',
          ink: '#1f1e1b',
          accent: '#0f766e',
          warn: '#b45309',
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
