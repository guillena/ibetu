import type { Metadata } from "next";
import { RetosFeed } from "@/components/retos/RetosFeed";

export const metadata: Metadata = { title: "Retos" };

export default function RetosPage() {
  return <RetosFeed />;
}
