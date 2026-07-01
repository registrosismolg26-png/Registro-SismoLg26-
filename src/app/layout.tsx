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
  title: "Registro de Afectados — Sismo La Guaira 2026",
  description: "Sistema de censo de familias afectadas por el sismo. Operación 100% offline en campo.",
  manifest: "/manifest.json?v=2",
  icons: {
    icon: "/logo_pwa.png",
    apple: "/logo_pwa.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "RegSismo",
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
        <script
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker'in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').then(function(r){console.log('SW:',r.scope)}).catch(function(e){console.warn('SW fail:',e)})})}`,
          }}
        />
      </body>
    </html>
  );
}
