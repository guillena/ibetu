import type { Metadata } from "next";
import { Suspense } from "react";
import { ChallengeDetailClient } from "@/components/retos/ChallengeDetailClient";

export const metadata: Metadata = { title: "Detalle del reto" };

async function DetailWrapper({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ChallengeDetailClient id={id} />;
}

export default function ChallengeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="py-space-md">
          <p className="type-title-md text-ink-navy-deep">Cargando desafío...</p>
        </div>
      }
    >
      <DetailWrapper params={params} />
    </Suspense>
  );
}

