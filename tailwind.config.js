/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        nexus: {
          primary: "hsl(var(--nexus-primary) / <alpha-value>)",
          "primary-foreground": "hsl(var(--nexus-primary-foreground) / <alpha-value>)",
          background: "hsl(var(--nexus-background) / <alpha-value>)",
          foreground: "hsl(var(--nexus-foreground) / <alpha-value>)",
          sidebar: "hsl(var(--nexus-sidebar) / <alpha-value>)",
          "sidebar-foreground": "hsl(var(--nexus-sidebar-foreground) / <alpha-value>)",
          muted: "hsl(var(--nexus-muted) / <alpha-value>)",
          "muted-foreground": "hsl(var(--nexus-muted-foreground) / <alpha-value>)",
          border: "hsl(var(--nexus-border) / <alpha-value>)",
          input: "hsl(var(--nexus-input) / <alpha-value>)",
          ring: "hsl(var(--nexus-ring) / <alpha-value>)",
        }
      },
      borderRadius: {
        nexus: "var(--nexus-radius)",
      }
    },
  },
  plugins: [],
}

