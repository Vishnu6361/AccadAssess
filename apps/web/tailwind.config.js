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
          bg: '#FAF8F3',          // Warm ivory/cream academic canvas
          canvasAlt: '#F4EFE3',   // Subtle secondary background
          surface: '#FFFFFF',     // Clean cards, forms, tables
          surfaceAlt: '#FCFBF8',  // Inner cards, table rows, panel highlights
          lightGreen: '#EBF2EC',  // Active/selected pills, icons, highlights
          paleGreen: '#F2F7EF',   // Secondary panels, badges, soft backgrounds
          primaryGreen: '#2D5A3F',// Primary buttons, links, authoritative brand green
          primaryHover: '#1E3F2E',// Button hover state
          deepGreen: '#1A3E2A',   // Headings, titles, high-emphasis text
          darkTeal: '#023730',    // Brand dark teal (logo)
          olive: '#708636',       // Brand olive green (logo)
          gold: '#C59B42',        // Brand gold star and accents
          muted: '#556E5D',       // Supporting information and captions
          border: '#E2DDD1',      // Standard card borders and dividers
          borderSubtle: '#EFEBE0',// Inner dividers and subtle borders
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        academic: '0 1px 3px 0 rgba(27, 77, 62, 0.05), 0 1px 2px 0 rgba(27, 77, 62, 0.03)',
        academicCard: '0 4px 20px -4px rgba(27, 77, 62, 0.06)',
      }
    },
  },
  plugins: [],
};
