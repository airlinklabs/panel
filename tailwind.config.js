/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/**/*.{html,ejs,js,ts}',
    './views/**/*',
    './public/**/*'
  ],
  darkMode: 'class',
  theme: {
    extend: {
      // Add custom scrollbar styles
      // Hide scrollbar for Chrome, Safari and Opera
      '::-webkit-scrollbar': {
        display: 'none'
      },
      // Hide scrollbar for IE, Edge and Firefox
      html: {
        'scrollbar-width': 'none',  /* Firefox */
        '-ms-overflow-style': 'none'  /* IE and Edge */
      }
    },
  },
  plugins: [
    require('@tailwindcss/forms')
  ],
};
