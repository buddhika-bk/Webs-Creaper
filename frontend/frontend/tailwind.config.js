const rgb = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        canvas: rgb('canvas'),
        surface: rgb('surface'),
        sunken: rgb('sunken'),
        ink: rgb('ink'),
        muted: rgb('muted'),
        line: rgb('line'),
        brand: { DEFAULT: rgb('brand'), deep: rgb('brand-deep'), soft: rgb('brand-soft') },
        accent: { DEFAULT: rgb('accent'), soft: rgb('accent-soft') },
        ok: rgb('ok'),
        warn: rgb('warn'),
        danger: rgb('danger'),
      },
      fontFamily: {
        sans: ['"Instrument Sans Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Bricolage Grotesque Variable"', '"Instrument Sans Variable"', 'ui-sans-serif', 'sans-serif'],
      },
      borderRadius: { card: '14px', hero: '24px' },
      boxShadow: {
        pop: '0 12px 32px -12px rgb(var(--shadow) / 0.35)',
        bar: '0 8px 24px -8px rgb(var(--shadow) / 0.3)',
      },
      keyframes: {
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        slideIn: { from: { transform: 'translateX(24px)', opacity: '0' }, to: { transform: 'none', opacity: '1' } },
        riseIn: { from: { transform: 'translateY(8px)', opacity: '0' }, to: { transform: 'none', opacity: '1' } },
      },
      animation: { slideIn: 'slideIn .22s ease-out', riseIn: 'riseIn .18s ease-out' },
    },
  },
  plugins: [],
};
