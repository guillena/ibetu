import type { Metadata } from "next";
import { HistorialClient } from "@/components/historial/HistorialClient";

export const metadata: Metadata = { title: "Historial" };

export default function HistorialPage() {
  return <HistorialClient />;
}
