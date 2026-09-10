import type { Config } from 'tailwindcss'
import animate from 'tailwindcss-animate'

/**
 * Damov design system.
 *
 * Brand primitives (source of truth — mirror of the brand sheet):
 *   Damov green        #6FBF48   hsl(100 48% 52%)   primary action / active service
 *   Deep operational   #0E392C   hsl(162 61% 14%)   navigation, operational chrome
 *   Signal amber       #E9B10A   hsl(45 92% 48%)    warnings, targets, pending
 *   Signal orange      #D9522A   hsl(14 70% 51%)    critical operational attention
 *   Mist               #CFD4D2   hsl(160 6% 82%)    dividers, muted surfaces
 */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1.5rem', screens: { '2xl': '1440px' } },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          50: 'hsl(100 48% 96%)',
          100: 'hsl(100 48% 90%)',
          200: 'hsl(100 48% 80%)',
          300: 'hsl(100 48% 70%)',
          400: 'hsl(100 48% 60%)',
          500: 'hsl(100 48% 52%)',
          600: 'hsl(100 50% 42%)',
          700: 'hsl(100 52% 32%)',
          800: 'hsl(120 45% 22%)',
          900: 'hsl(162 61% 14%)',
        },
        forest: {
          DEFAULT: 'hsl(162 61% 14%)',
          50: 'hsl(162 30% 95%)',
          100: 'hsl(162 28% 88%)',
          200: 'hsl(162 26% 74%)',
          300: 'hsl(162 28% 56%)',
          400: 'hsl(162 40% 34%)',
          500: 'hsl(162 55% 22%)',
          600: 'hsl(162 61% 17%)',
          700: 'hsl(162 61% 14%)',
          800: 'hsl(162 62% 11%)',
          900: 'hsl(162 64% 8%)',
          950: 'hsl(162 66% 5%)',
        },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        warning: { DEFAULT: 'hsl(45 92% 48%)', foreground: 'hsl(45 96% 10%)' },
        critical: { DEFAULT: 'hsl(14 70% 51%)', foreground: 'hsl(0 0% 100%)' },
        info: { DEFAULT: 'hsl(206 74% 46%)', foreground: 'hsl(0 0% 100%)' },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar))',
          foreground: 'hsl(var(--sidebar-foreground))',
          muted: 'hsl(var(--sidebar-muted))',
          accent: 'hsl(var(--sidebar-accent))',
          border: 'hsl(var(--sidebar-border))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 4px)',
        sm: 'calc(var(--radius) - 6px)',
        xl: 'calc(var(--radius) + 4px)',
        '2xl': 'calc(var(--radius) + 10px)',
      },
      fontFamily: {
        sans: ['Inter var', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.02em' }],
      },
      boxShadow: {
        subtle: '0 1px 2px 0 hsl(162 30% 10% / 0.05)',
        card: '0 1px 3px hsl(162 30% 10% / 0.06), 0 8px 24px -12px hsl(162 30% 10% / 0.14)',
        lifted: '0 2px 6px hsl(162 30% 10% / 0.08), 0 18px 40px -18px hsl(162 30% 10% / 0.28)',
        glow: '0 0 0 1px hsl(100 48% 52% / 0.35), 0 8px 32px -8px hsl(100 48% 52% / 0.45)',
      },
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'rise-in': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        'pulse-ring': {
          '0%': { transform: 'scale(0.85)', opacity: '0.7' },
          '70%': { transform: 'scale(1.6)', opacity: '0' },
          '100%': { transform: 'scale(1.6)', opacity: '0' },
        },
        'route-dash': { to: { strokeDashoffset: '-24' } },
        'count-tick': { '0%': { transform: 'translateY(40%)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-in': 'fade-in 0.25s ease-out both',
        'rise-in': 'rise-in 0.35s cubic-bezier(0.22, 1, 0.36, 1) both',
        shimmer: 'shimmer 1.8s infinite',
        'pulse-ring': 'pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'route-dash': 'route-dash 1s linear infinite',
        'count-tick': 'count-tick 0.4s cubic-bezier(0.22, 1, 0.36, 1) both',
      },
      transitionTimingFunction: {
        damov: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [animate],
} satisfies Config
