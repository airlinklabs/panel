/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{html,ejs,js,ts}',
  ],
  darkMode: 'class',
  theme: {
    extend: {},
  },
  plugins: [
    require('@tailwindcss/forms')
  ],
}

