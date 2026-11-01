import type { Metadata, Viewport } from "next";
import { Manrope, Outfit } from "next/font/google";
import "./globals.css";

// Outfit (títulos y cifras) y Manrope (cuerpo y etiquetas): fuentes variables, autoalojadas.
const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  display: "swap",
});

const manrope = Manrope({
  variable: "--font-manrope",
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
    <html lang="es" className={`${outfit.variable} ${manrope.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
