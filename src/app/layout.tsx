import type { Metadata, Viewport } from "next";
import { Poppins, Montserrat } from "next/font/google";
import "./globals.css";

/*
  next/font/google downloads font files at build time and serves them
  from /_next/static/ — same origin as the app. The service worker's
  cache-first rule for /_next/static/* caches them automatically,
  making Poppins + Montserrat fully available offline with zero CDN calls.
*/
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-montserrat",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Campamentos Transitorios — La Guaira 2026",
  description: "Sistema de gestión de campamentos transitorios de La Guaira.",
  manifest: "/manifest.json?v=6",
  icons: {
    // El favicon.ico (src/app/favicon.ico) lo inyecta Next por convención; aquí se
    // añaden PNG versionados (?v=6) para forzar el refresco del favicon y de los
    // iconos, evitando el cache agresivo del navegador al reusar la misma URL.
    icon: [
      { url: "/icon-192.png?v=6", type: "image/png", sizes: "192x192" },
      { url: "/favicon-32.png?v=6", type: "image/png", sizes: "32x32" },
    ],
    apple: "/apple-icon-180.png?v=6",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Campamentos",
  },
};

export const viewport: Viewport = {
  themeColor: "#1e3a8a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="es"
      className={`${poppins.variable} ${montserrat.variable}`}
    >
      <body>
        {children}
      </body>
    </html>
  );
}
