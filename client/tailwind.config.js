/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Neutral-blue accent ramp (anchor #0066cc). Kept under the `brand`
        // name so 300+ existing usages re-render in the new accent without a
        // codemod; wave 2 migrates them to semantic tokens.
        brand: {
          50: "#f0f6fc", 100: "#e1edf8", 200: "#c6ddf1", 300: "#9cc4e6",
          400: "#6aa3d8", 500: "#3d82c9", 600: "#0066cc", 700: "#0055b0",
          800: "#084a92", 900: "#0d3e78",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      fontFamily: {
        sans: [
          "Geist Variable",
          "SF Pro Text",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        heading: "var(--font-sans)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "calc(var(--radius) + 4px)",
        "2xl": "calc(var(--radius) + 8px)",
      },
      boxShadow: {
        sm: "0 1px 2px rgb(0 0 0 / 0.05)",
        DEFAULT: "0 1px 3px rgb(0 0 0 / 0.05), 0 1px 2px rgb(0 0 0 / 0.03)",
        md: "0 4px 12px rgb(0 0 0 / 0.06), 0 1px 3px rgb(0 0 0 / 0.04)",
        lg: "0 8px 24px rgb(0 0 0 / 0.08), 0 2px 8px rgb(0 0 0 / 0.04)",
        card: "0 2px 8px rgb(0 0 0 / 0.04), 0 1px 2px rgb(0 0 0 / 0.04)",
        elevated: "0 8px 30px rgb(0 0 0 / 0.08), 0 2px 8px rgb(0 0 0 / 0.04)",
      },
      animation: {
        "bounce-in": "bounceIn 0.5s ease-out",
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "collapsible-down": "collapsible-down 0.2s ease-out",
        "collapsible-up": "collapsible-up 0.2s ease-out",
        "caret-blink": "caret-blink 1.25s ease-out infinite",
        "enter": "enter 0.15s ease-out",
        "exit": "exit 0.15s ease-out",
        "fade-in-0": "fade-in 0s ease-out",
        "zoom-in-95": "enter 0.15s ease-out",
        "zoom-out-95": "exit 0.15s ease-out",
        "slide-in-from-top-2": "enter 0.15s ease-out",
        "slide-in-from-left-2": "enter 0.15s ease-out",
        "slide-in-from-right-2": "enter 0.15s ease-out",
        "slide-out-to-left-2": "exit 0.15s ease-out",
        "slide-out-to-right-2": "exit 0.15s ease-out",
        "spin-in-1": "enter 0.15s ease-out",
        "spin-out-1": "exit 0.15s ease-out",
      },
      keyframes: {
        bounceIn: {
          "0%": { transform: "scale(0.3)", opacity: "0" },
          "50%": { transform: "scale(1.05)" },
          "70%": { transform: "scale(0.9)" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        slideUp: {
          "0%": { transform: "translateY(20px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--accordion-panel-height, var(--radix-accordion-content-height, auto))" },
        },
        "accordion-up": {
          from: { height: "var(--accordion-panel-height, var(--radix-accordion-content-height, auto))" },
          to: { height: "0" },
        },
        "collapsible-down": {
          from: { height: "0", opacity: "0" },
          to: { height: "var(--radix-collapsible-content-height, auto)", opacity: "1" },
        },
        "collapsible-up": {
          from: { height: "var(--radix-collapsible-content-height, auto)", opacity: "1" },
          to: { height: "0", opacity: "0" },
        },
        "caret-blink": {
          "0%,70%,100%": { opacity: "1" },
          "20%,50%": { opacity: "0" },
        },
        enter: {
          from: { opacity: "var(--tw-enter-opacity, 1)", transform: "scale(var(--tw-enter-scale, 1))" },
        },
        exit: {
          to: { opacity: "var(--tw-exit-opacity, 1)", transform: "scale(var(--tw-exit-scale, 1))" },
        },
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
