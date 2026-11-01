import type { Metadata } from "next";
import { MonederoClient } from "@/components/monedero/MonederoClient";

export const metadata: Metadata = { title: "Monedero" };

export default function MonederoPage() {
  return <MonederoClient />;
}
