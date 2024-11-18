/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{html,ejs,js,ts}',
    './views/**/*',
  ],
  darkMode: 'class',
  theme: {
    extend: {},
  },
  plugins: [
    require('@tailwindcss/forms')
  ],
}

