import type { Metadata, Viewport } from "next";
import { Nunito } from "next/font/google";
import "./globals.css";

// Nunito (títulos, cifras, cuerpo y etiquetas): fuente variable, autoalojada.
const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "I Bet U",
    template: "%s · I Bet U",
  },
  description: "Desafíos entre amigos. Creá un reto en segundos, jugalo y que quede registrado.",
  applicationName: "I Bet U",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Pantalla completa en celulares con notch; el zoom del usuario queda habilitado.
  viewportFit: "cover",
  themeColor: "#f9f9ff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${nunito.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
