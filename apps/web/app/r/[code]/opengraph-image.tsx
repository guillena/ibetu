import { ImageResponse } from "next/og";
import type { PublicInviteChallenge } from "@/components/invitacion/InvitePageClient";

export const alt = "Invitación a un reto en I Bet U";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

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

export default async function Image({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const challenge = await fetchInviteByCode(code);

  const creatorText = challenge
    ? `${challenge.creator.displayName} (@${challenge.creator.username}) · ${challenge.creator.credibility.score}% Fair Play`
    : "Desafío entre amigos";

  const titleText = challenge
    ? challenge.title
    : `Te desafiaron en I Bet U · Reto #${code}`;

  const potText = challenge
    ? challenge.mode === "COINS"
      ? `Pozo: ${(challenge.pot ?? challenge.stakeAmount * 2).toLocaleString("es-AR")} monedas (${challenge.stakeAmount} c/u)`
      : `Plata: $${challenge.stakeAmount.toLocaleString("es-AR")} cada uno`
    : "Recibís +50 monedas de regalo al entrar";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "56px 64px",
          backgroundColor: "#F0F7FF",
          color: "#0E1E38",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div
              style={{
                width: "64px",
                height: "64px",
                borderRadius: "9999px",
                backgroundColor: "#0099FF",
                color: "#FFFFFF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "34px",
                fontWeight: 800,
              }}
            >
              ⚡
            </div>
            <span
              style={{
                fontSize: "44px",
                fontWeight: 800,
                color: "#0E1E38",
              }}
            >
              I Bet U
            </span>
          </div>

          <div
            style={{
              backgroundColor: "#FFDF99",
              color: "#5C3D00",
              padding: "14px 28px",
              borderRadius: "9999px",
              fontSize: "28px",
              fontWeight: 700,
            }}
          >
            {potText}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "18px",
            backgroundColor: "#FFFFFF",
            padding: "44px 48px",
            borderRadius: "32px",
            boxShadow: "0 16px 40px rgba(14, 30, 56, 0.08)",
          }}
        >
          <span
            style={{
              fontSize: "26px",
              fontWeight: 700,
              color: "#0066CC",
            }}
          >
            {creatorText}
          </span>
          <span
            style={{
              fontSize: "52px",
              fontWeight: 800,
              lineHeight: 1.18,
              color: "#0E1E38",
            }}
          >
            {titleText}
          </span>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              fontSize: "26px",
              fontWeight: 600,
              color: "#43536B",
            }}
          >
            Tocá el enlace para aceptar el desafío (+50 monedas gratis)
          </span>
          <span
            style={{
              backgroundColor: "#5CFD80",
              color: "#053B16",
              padding: "10px 24px",
              borderRadius: "9999px",
              fontSize: "24px",
              fontWeight: 800,
            }}
          >
            #{code}
          </span>
        </div>
      </div>
    ),
    { ...size },
  );
}
