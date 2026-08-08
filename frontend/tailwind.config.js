/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--bg-main)',
        surface: 'var(--bg-surface)',
        border: 'var(--border-color)',
        primary: 'var(--accent)',
        primaryHover: 'var(--accent)',
        textMain: '#ffffff',
        textMuted: '#a1a1aa'
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"IBM Plex Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
}
