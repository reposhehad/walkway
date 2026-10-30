/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx,html}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#3978E8',
          hover: '#2866D4',
          light: '#EEF4FE'
        },
        violet: {
          DEFAULT: '#8058D8',
          hover: '#6B44C5',
          light: '#F4F0FC'
        },
        success: {
          DEFAULT: '#12A879',
          light: '#E8F7F2'
        },
        warning: {
          DEFAULT: '#E6A23C',
          light: '#FDF6EC'
        },
        danger: {
          DEFAULT: '#E65363',
          light: '#FDEEEF'
        },
        bgmain: '#F4F7FC',
        surface: '#FFFFFF',
        surfacesoft: '#F8FAFD',
        borderline: '#DFE6F0',
        textmain: '#26344A',
        textsec: '#718096',
        textmuted: '#9AA6B5'
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif']
      }
    },
  },
  plugins: [],
}

