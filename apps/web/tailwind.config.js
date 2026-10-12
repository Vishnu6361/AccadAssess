/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        academic: {
          bg: '#F4EFE3',          // Warm academic canvas
          surface: '#FFFDF8',     // Cards, forms, tables
          lightGreen: '#E7F0E4',  // Selected states and summaries
          paleGreen: '#F2F7EF',   // Secondary panels
          primaryGreen: '#355E3B',// Buttons, links and active navigation
          deepGreen: '#27452C',   // Headings and high-emphasis text
          muted: '#667066',       // Supporting information
          border: '#C9D2C5',      // Dividers and inputs
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        academic: '0 1px 3px 0 rgba(39, 69, 44, 0.05), 0 1px 2px 0 rgba(39, 69, 44, 0.03)',
      }
    },
  },
  plugins: [],
};
