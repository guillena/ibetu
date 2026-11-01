import type { Metadata } from "next";
import { CrearRetoForm } from "@/components/crear/CrearRetoForm";

export const metadata: Metadata = { title: "Crear reto" };

export default function CrearPage() {
  return <CrearRetoForm />;
}
