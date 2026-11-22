// Each utility keeps its existing light color. Dark mode supplies RGB channels
// by role so opacity modifiers and interaction variants use the same palette.
function themed(roles) {
  return ({ theme }) => {
    const utilities = {}
    for (const [role, swatches] of Object.entries(roles)) {
      for (const swatch of swatches.split(' ')) {
        const palette = theme(`colors.${swatch.replace('-', '.')}`)
        const hex = (palette.DEFAULT ?? palette).slice(1)
        const fullHex = hex.length === 3 ? [...hex].map(digit => digit.repeat(2)).join('') : hex
        const rgb = fullHex.match(/../g).map(pair => parseInt(pair, 16)).join(' ')
        utilities[swatch] = `rgb(var(--${role}, ${rgb}) / <alpha-value>)`
      }
    }
    return utilities
  }
}

const surfaces = {
  panel: 'white', canvas: 'gray-50', raised: 'gray-100', inset: 'gray-200 gray-300',
  sea: 'teal-50 teal-100 green-50', ocean: 'navy-50 navy-100 lightblue-50 lightblue-100 blue-50',
  warm: 'gold-50 gold-100 amber-50 yellow-50', danger: 'red-50',
}

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/{project-utils,cruise-utils,cruise-timeline}.ts',
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#1B3A6B',
          50: '#EEF2F9',
          100: '#D5E0F0',
          200: '#A8BFE0',
          300: '#7A9ED0',
          400: '#4D7DC0',
          500: '#1B3A6B',
          600: '#162F56',
          700: '#112440',
          800: '#0C192B',
          900: '#070E15',
        },
        gold: {
          DEFAULT: '#F5A623',
          50: '#FEF6E7',
          100: '#FDEBC4',
          200: '#FBD78A',
          300: '#F9C350',
          400: '#F5A623',
          500: '#D4880A',
          600: '#A36808',
          700: '#724905',
          800: '#412903',
          900: '#100A01',
        },
        teal: {
          DEFAULT: '#2A7B6F',
          50: '#E8F4F2',
          100: '#C5E4E0',
          200: '#8BCAC2',
          300: '#51AFA4',
          400: '#2A7B6F',
          500: '#21625A',
          600: '#194A44',
          700: '#11312D',
          800: '#081917',
          900: '#030808',
        },
        lightblue: {
          DEFAULT: '#B8D9E8',
          50: '#F0F8FC',
          100: '#D8EDF6',
          200: '#B8D9E8',
          300: '#92C4DA',
          400: '#6CAFCB',
          500: '#4699BD',
        },
      },
      backgroundColor: themed(surfaces),
      gradientColorStops: themed(surfaces),
      textColor: themed({
        heading: 'navy navy-600 navy-800 gray-800 gray-900 black',
        copy: 'gray-600 gray-700', secondary: 'gray-500', muted: 'gray-300 gray-400',
        accent: 'teal teal-500 green-600 green-700', link: 'blue-600 blue-700',
        warning: 'amber-600 amber-700 amber-800 amber-900 yellow-700 gold-700',
        error: 'red-400 red-500 red-600 red-700',
      }),
      borderColor: themed({
        line: 'gray-50 gray-100 gray-200', strongLine: 'gray-300 gray-400 navy',
        accent: 'teal', seaLine: 'teal-100 teal-200 green-200', oceanLine: 'blue-100',
        warmLine: 'amber-200 yellow-200 gold-200 gold-300', dangerLine: 'red-100 red-200',
      }),
      ringColor: themed({ accent: 'teal' }),
      placeholderColor: themed({ muted: 'gray-300 gray-400 gray-500' }),
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 2px 16px rgba(27, 58, 107, 0.08)',
        'card-hover': '0 8px 32px rgba(27, 58, 107, 0.16)',
        modal: '0 20px 60px rgba(0, 0, 0, 0.3)',
      },
    },
  },
  plugins: [],
}
