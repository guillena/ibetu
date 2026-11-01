import type { Metadata } from "next";
import { Suspense } from "react";
import {
  InvitePageClient,
  type PublicInviteChallenge,
} from "@/components/invitacion/InvitePageClient";

const apiOrigin = process.env.API_URL ?? "http://localhost:3001";

async function fetchInviteByCode(
  code: string,
): Promise<PublicInviteChallenge | null> {
  try {
    const res = await fetch(
      `${apiOrigin}/challenges/by-code/${encodeURIComponent(code)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    return (await res.json()) as PublicInviteChallenge;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const challenge = await fetchInviteByCode(code);

  const ogTitle = challenge
    ? `${challenge.creator.displayName} te desafía en I Bet U: ${challenge.title}`
    : `Te desafiaron en I Bet U · Reto #${code}`;

  const ogDescription = challenge
    ? challenge.mode === "COINS"
      ? `Pozo en juego: ${(challenge.pot ?? challenge.stakeAmount * 2).toLocaleString("es-AR")} monedas (${challenge.stakeAmount} c/u). Aceptá el reto ahora y recibí 50 monedas gratis.`
      : `Apuesta entre amigos: $${challenge.stakeAmount.toLocaleString("es-AR")} cada uno. Aceptá el reto #${code} en I Bet U.`
    : `Aceptá el desafío #${code} en I Bet U, registrate en un toque con tu Nombre y @usuario y recibí 50 monedas de regalo.`;

  return {
    title: ogTitle,
    description: ogDescription,
    openGraph: {
      title: ogTitle,
      description: ogDescription,
      type: "website",
      locale: "es_AR",
      siteName: "I Bet U",
    },
  };
}

async function InviteContent({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const challenge = await fetchInviteByCode(code);
  return <InvitePageClient code={code} initialChallenge={challenge} />;
}

export default function InvitePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex min-h-dvh w-full max-w-[var(--shell-max-w)] items-center justify-center px-margin">
          <p className="type-title-md text-ink-navy-deep">Cargando invitación...</p>
        </div>
      }
    >
      <InviteContent params={params} />
    </Suspense>
  );
}

