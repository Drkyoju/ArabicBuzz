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
          // Lightest text tone that still clears WCAG AA on --ab-bg / white.
          'muted-soft': '#6b746e',
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
        // Forest-tinted rather than neutral black, so elevation reads as part
        // of the palette instead of grey haze.
        ab: '0 10px 30px -12px rgba(14, 60, 46, 0.18)',
        'ab-sm': '0 1px 2px rgba(14, 60, 46, 0.05)',
        'ab-md': '0 6px 18px -8px rgba(14, 60, 46, 0.16)',
      },
      fontFamily: {
        sans: ['var(--font-ibm-plex-arabic)', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [require('tailwindcss-rtl')],
}
