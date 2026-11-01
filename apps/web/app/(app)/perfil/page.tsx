import type { Metadata } from "next";
import { PerfilClient } from "@/components/perfil/PerfilClient";

export const metadata: Metadata = { title: "Mi perfil" };

export default function PerfilPage() {
  return <PerfilClient />;
}
