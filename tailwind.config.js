/** @type {import('tailwindcss').Config} */
export default {
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
};
