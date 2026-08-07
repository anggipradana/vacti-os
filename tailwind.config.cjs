const path = require('path');
const animate = require('tailwindcss-animate');

const token = (name) => `hsl(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [path.join(__dirname, 'apps/web/src/**/*.{ts,tsx}')],
  theme: {
    extend: {
      colors: {
        bg: token('bg'),
        surface: token('surface'),
        'surface-2': token('surface-2'),
        'surface-3': token('surface-3'),
        border: token('border'),
        'border-strong': token('border-strong'),
        fg: token('fg'),
        'fg-muted': token('fg-muted'),
        'fg-subtle': token('fg-subtle'),
        accent: token('accent'),
        'accent-hover': token('accent-hover'),
        'accent-fg': token('accent-fg'),
        ring: token('ring'),
        critical: token('sev-critical'),
        high: token('sev-high'),
        medium: token('sev-medium'),
        low: token('sev-low'),
        info: token('sev-info'),
        'risk-green': token('risk-green'),
        'risk-amber': token('risk-amber'),
        'risk-red': token('risk-red'),
        success: token('success'),
        danger: token('danger'),
      },
      borderRadius: { lg: 'var(--radius)', md: 'calc(var(--radius) - 4px)', sm: 'calc(var(--radius) - 6px)' },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
        display: ['var(--font-sans)', 'sans-serif'],
      },
      keyframes: {
        'fade-in': { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'none' } },
        'pulse-dot': { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.35' } },
      },
      animation: {
        'fade-in': 'fade-in 0.18s cubic-bezier(0.2,0.8,0.2,1)',
        'pulse-dot': 'pulse-dot 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [animate],
};
