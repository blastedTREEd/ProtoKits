/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: 'class',
  theme: {
    extend: {
      // Keep Tailwind's font-sans utility aligned with the app's explicit
      // typography instead of the device-dependent ui-sans-serif stack.
      fontFamily: {
        sans: ['Arial', 'Helvetica Neue', 'sans-serif'],
      },
      screens: {
        'portrait': { 'raw': '(orientation: portrait)' },
        'landscape': { 'raw': '(orientation: landscape)' },
      },
      colors: {
        garage: {
          bg: 'var(--color-bg)',
          surface: 'var(--color-surface)',
          border: 'var(--color-border)',
          text: 'var(--color-text-main)',
          blue: 'var(--color-primary)',
        }
      }
    },
  },
  plugins: [],
}
