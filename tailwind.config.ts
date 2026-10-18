import type { Config } from 'tailwindcss'
import animate from 'tailwindcss-animate'

/**
 * Damov design system.
 *
 * Brand primitives:
 *   Damov green        hsl(100 58% 56%)   primary action, live service, the glow
 *   Ink                hsl(160 10% 4%)    the operating surface
 *   Signal amber       hsl(45 92% 48%)    warnings, targets, pending
 *   Signal orange      hsl(14 70% 51%)    critical attention
 *   Good               hsl(152 64% 46%)   positive deltas and healthy status only
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
          50: 'hsl(100 50% 96%)',
          100: 'hsl(100 50% 91%)',
          200: 'hsl(100 52% 82%)',
          300: 'hsl(100 55% 70%)',
          400: 'hsl(100 58% 62%)',
          500: 'hsl(100 58% 54%)',
          600: 'hsl(100 55% 44%)',
          700: 'hsl(100 55% 34%)',
          800: 'hsl(110 50% 24%)',
          900: 'hsl(140 50% 14%)',
        },
        ink: {
          DEFAULT: 'hsl(160 10% 5%)',
          50: 'hsl(150 15% 96%)',
          100: 'hsl(150 12% 90%)',
          200: 'hsl(155 10% 76%)',
          300: 'hsl(158 8% 56%)',
          400: 'hsl(160 8% 34%)',
          500: 'hsl(160 9% 20%)',
          600: 'hsl(160 9% 13%)',
          700: 'hsl(160 9% 9%)',
          800: 'hsl(160 10% 6%)',
          900: 'hsl(160 10% 4%)',
          950: 'hsl(160 12% 2%)',
        },
        good: { DEFAULT: 'hsl(152 64% 46%)', foreground: 'hsl(152 70% 10%)' },
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
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['Space Grotesk', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.02em' }],
      },
      boxShadow: {
        subtle: '0 1px 2px 0 hsl(160 20% 2% / 0.4)',
        card: '0 1px 2px hsl(160 20% 2% / 0.45), 0 10px 30px -18px hsl(160 20% 2% / 0.6)',
        lifted: '0 2px 6px hsl(160 20% 2% / 0.5), 0 24px 48px -20px hsl(160 20% 2% / 0.7)',
        glow: '0 0 0 1px hsl(100 58% 56% / 0.4), 0 10px 36px -8px hsl(100 58% 56% / 0.5)',
        'glow-sm': '0 0 0 1px hsl(100 58% 56% / 0.3), 0 4px 16px -4px hsl(100 58% 56% / 0.4)',
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
        wave: { '0%, 100%': { transform: 'rotate(0deg)' }, '20%': { transform: 'rotate(14deg)' }, '40%': { transform: 'rotate(-8deg)' }, '60%': { transform: 'rotate(14deg)' }, '80%': { transform: 'rotate(-4deg)' } },
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
