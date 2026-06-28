/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{js,ts,jsx,tsx,html}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // DJ Dark Theme palette
        surface: {
          DEFAULT: '#0f0f17',
          1: '#13131e',
          2: '#1a1a28',
          3: '#22223a',
          4: '#2c2c46',
        },
        border: {
          DEFAULT: '#2a2a42',
          bright: '#3a3a58',
        },
        accent: {
          purple: '#7c3aed',
          'purple-light': '#a78bfa',
          pink: '#db2777',
          cyan: '#06b6d4',
        },
        energy: {
          low: '#22c55e',
          mid: '#eab308',
          high: '#f97316',
          peak: '#ef4444',
        }
      },
      fontFamily: {
        sans: ['Heebo', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow': 'spin 3s linear infinite',
      }
    },
  },
  plugins: [],
}
