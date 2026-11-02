"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { ApiError, apiFetch } from "@/lib/api";

export interface WhatsappLinkTokenResponse {
  token: string;
  messageText?: string;
  whatsappUrl?: string;
  waUrl?: string;
  expiresInSeconds: number;
}

interface WhatsappLinkPromptCardProps {
  accessToken: string;
  title?: string;
  subtitle?: string;
}

export function WhatsappLinkPromptCard({
  accessToken,
  title = "Vinculá tu WhatsApp y sumá +50 monedas",
  subtitle = "Con un mensaje pre-armado protegés tu cuenta para volver a entrar cuando quieras y recibís avisos de tus retos.",
}: WhatsappLinkPromptCardProps) {
  const [wspLoading, setWspLoading] = useState(false);
  const [wspTokenData, setWspTokenData] =
    useState<WhatsappLinkTokenResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerateWhatsappLinkToken() {
    if (!accessToken) return;
    setWspLoading(true);
    setError(null);
    try {
      const res = await apiFetch<WhatsappLinkTokenResponse>(
        "/auth/whatsapp/link-token",
        {
          method: "POST",
          token: accessToken,
        },
      );
      setWspTokenData(res);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "No se pudo generar el código de WhatsApp.",
      );
    } finally {
      setWspLoading(false);
    }
  }

  const targetUrl = wspTokenData?.whatsappUrl ?? wspTokenData?.waUrl ?? "#";

  return (
    <div
      data-testid="whatsapp-reverse-link-box"
      className="flex flex-col gap-space-sm rounded-md bg-surface-sky-tint p-space-md"
    >
      <div className="flex items-start gap-space-xs">
        <Icon name="chat" filled size={22} className="text-secondary" />
        <div>
          <h3 className="type-title-md text-ink-navy-deep">{title}</h3>
          <p className="type-body-md mt-0.5 text-on-surface-variant">
            {subtitle}
          </p>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="type-body-md rounded-md bg-error-container px-space-sm py-2 text-on-error-container"
        >
          {error}
        </div>
      )}

      {!wspTokenData ? (
        <button
          type="button"
          disabled={wspLoading}
          onClick={handleGenerateWhatsappLinkToken}
          data-testid="btn-generate-wsp-token"
          className="type-label-lg touch-target inline-flex items-center justify-center gap-space-xs rounded-lg px-space-md btn-3d btn-3d--success"
        >
          <Icon name="verified_user" size={20} />
          <span>
            {wspLoading
              ? "Generando código..."
              : "Vincular mi WhatsApp (+50 monedas)"}
          </span>
        </button>
      ) : (
        <div className="flex flex-col gap-space-xs">
          <p className="type-label-md text-ink-navy-deep">
            Tu código temporal:{" "}
            <strong data-testid="wsp-link-token">{wspTokenData.token}</strong>
          </p>
          <a
            href={targetUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="wsp-send-link"
            className="type-label-lg touch-target inline-flex items-center justify-center gap-space-xs rounded-lg px-space-md btn-3d btn-3d--success"
          >
            <Icon name="send" size={18} />
            <span>Enviar mensaje por WhatsApp</span>
          </a>
        </div>
      )}
    </div>
  );
}

