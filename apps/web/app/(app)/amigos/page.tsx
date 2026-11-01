import type { Metadata } from "next";
import { AmigosClient } from "@/components/amigos/AmigosClient";

export const metadata: Metadata = { title: "Amigos" };

export default function AmigosPage() {
  return <AmigosClient />;
}
