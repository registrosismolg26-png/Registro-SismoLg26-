/** @type {import('tailwindcss').Config} */
module.exports = {
  // Migración progresiva: Tailwind convive con el CSS existente (src/app/globals.css).
  // Escanea src/ para generar SOLO las utilidades que realmente se usen.
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],

  corePlugins: {
    // Preflight DESACTIVADO a propósito: es el reset global de Tailwind y pisaría
    // el CSS del proyecto (headings, botones, listas, box-sizing…). Apagándolo,
    // Tailwind no resetea nada — solo añade utilidades cuando las usamos, así el
    // diseño actual queda intacto y podemos migrar poco a poco.
    preflight: false,
  },

  theme: {
    extend: {
      // Colores semánticos mapeados a las variables del sistema (globals.css), para
      // que utilidades como bg-primary / text-danger / border-success coincidan con
      // el diseño actual y respeten el modo claro/oscuro automáticamente.
      colors: {
        primary: {
          DEFAULT: "var(--color-primary)",
          hover: "var(--color-primary-hover)",
          light: "var(--color-primary-light)",
        },
        success: "var(--color-success)",
        warning: "var(--color-warning)",
        danger: "var(--color-danger)",
        gold: "var(--color-gold)",
        teal: "var(--color-teal)",
        cyan: "var(--color-cyan)",
      },
    },
  },

  plugins: [],
};
