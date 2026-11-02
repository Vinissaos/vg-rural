import type { Metadata, Viewport } from "next";
import { connection } from "next/server";

import { clientEnv } from "@/lib/env/client";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(clientEnv.NEXT_PUBLIC_SITE_URL),
  title: {
    default: "VG Rural",
    template: "%s · VG Rural",
  },
  description: "Gestão de holdings rurais, fazendas, documentos e financeiro.",
  // Ambiente fechado: nada deve ser indexado por buscadores nesta fase.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Renderização dinâmica obrigatória: o nonce da CSP muda a cada requisição.
  await connection();

  return (
    <html lang="pt-BR">
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
