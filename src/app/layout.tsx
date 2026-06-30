import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Registro de Damnificados - Sismo 2026",
  description: "Formulario de registro de emergencia de damnificados. Optimizado para bajo consumo de datos y uso offline.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "RegSismo"
  }
};

export const viewport: Viewport = {
  themeColor: "#5746e3",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="h-full">
      <body className="min-h-full flex flex-col font-sans antialiased bg-slate-950 text-slate-100">
        {children}
        {process.env.NODE_ENV === 'production' ? (
          <script
            dangerouslySetInnerHTML={{
              __html: `
                if ('serviceWorker' in navigator) {
                  window.addEventListener('load', function() {
                    navigator.serviceWorker.register('/sw.js')
                      .then(function(reg) {
                        console.log('Service Worker registrado con éxito:', reg.scope);
                      })
                      .catch(function(err) {
                        console.warn('Fallo al registrar Service Worker:', err);
                      });
                  });
                }
              `
            }}
          />
        ) : (
          <script
            dangerouslySetInnerHTML={{
              __html: `
                if ('serviceWorker' in navigator) {
                  navigator.serviceWorker.getRegistrations().then(function(registrations) {
                    for (let reg of registrations) {
                      reg.unregister().then(function(success) {
                        if (success) {
                          console.log('Service Worker de desarrollo eliminado.');
                          window.location.reload();
                        }
                      });
                    }
                  });
                }
              `
            }}
          />
        )}
      </body>
    </html>
  );
}
