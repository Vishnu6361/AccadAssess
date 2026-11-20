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
          bg: '#F8FAFC',          // Clean light institutional canvas
          canvasAlt: '#F1F5F9',   // Slate light background
          surface: '#FFFFFF',     // Clean cards, forms, tables
          surfaceAlt: '#F8FAFC',  // Inner cards, table rows, panel highlights
          lightGreen: '#EEF4FF',  // Active/selected pills, icons, soft brand highlights (SJBIT ice blue)
          paleGreen: '#F0F6FF',   // Secondary panels, badges, soft backgrounds
          primaryGreen: '#0A2B8E',// Primary institutional button/brand color (SJBIT Royal Blue)
          primaryHover: '#011B6A',// Button hover state (SJBIT Deep Navy)
          deepGreen: '#011B6A',   // Headings, titles, high-emphasis text (SJBIT Deep Navy)
          darkTeal: '#0A2B8E',    // Institutional primary blue
          olive: '#011B6A',       // Institutional navy
          gold: '#FFBF00',        // Official SJBIT Amber Gold accent
          goldHover: '#E5A800',   // Amber Gold hover
          muted: '#64748B',       // Clean slate supporting info and captions
          border: '#E2E8F0',      // Standard slate card borders and dividers
          borderSubtle: '#F1F5F9',// Inner dividers and subtle borders
          // SJBIT Explicit Named Aliases
          primaryBlue: '#0A2B8E', // Official SJBIT Royal Blue
          primaryNavy: '#011B6A', // Official SJBIT Deep Navy
          accentGold: '#FFBF00',  // Official SJBIT Amber Gold
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        academic: '0 1px 3px 0 rgba(10, 43, 142, 0.05), 0 1px 2px 0 rgba(10, 43, 142, 0.03)',
        academicCard: '0 4px 20px -4px rgba(10, 43, 142, 0.08)',
      }
    },
  },
  plugins: [],
};
