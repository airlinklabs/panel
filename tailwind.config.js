/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{html,ejs,js,ts}',
    './src/views/**/*.,{html,ejs,js,ts}',
    './__tests__/*.html',
  ],
  darkMode: 'class',
  theme: {
    extend: {},
  },
  plugins: [require('@tailwindcss/forms')],
};
