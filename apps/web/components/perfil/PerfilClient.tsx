"use client";

import { useEffect, useState } from "react";
import { InstantAuthCard } from "@/components/auth/InstantAuthCard";
import { useShell } from "@/components/shell/shell-context";
import { Icon } from "@/components/ui/Icon";
import { ApiError, apiFetch, type ProfileView } from "@/lib/api";

export function PerfilClient() {
  const { session, setSession, setFairPlay } = useShell();
  const [profile, setProfile] = useState<ProfileView | null>(null);

  useEffect(() => {
    if (!session?.accessToken) {
      setProfile(null);
      return;
    }
    let active = true;
    apiFetch<ProfileView>("/users/me/profile", {
      token: session.accessToken,
    })
      .then((res) => {
        if (!active) return;
        setProfile(res);
        setFairPlay({
          score: res.credibility.score,
          band: res.credibility.band,
        });
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 401) {
          setSession(null);
        }
      });
    return () => {
      active = false;
    };
  }, [session?.accessToken, setFairPlay, setSession]);

  return (
    <div className="flex flex-col gap-space-md">
      <div>
        <h1 className="type-headline-lg-mobile text-ink-navy-deep">Mi perfil</h1>
        <p className="type-body-md mt-space-xs text-on-surface-variant">
          Tus desafíos jugados, tus victorias y tu % Fair Play.
        </p>
      </div>

      {!session ? (
        <InstantAuthCard />
      ) : (
        <>
          <section
            data-testid="profile-card"
            className="flex flex-col gap-space-md rounded-lg bg-surface-container-lowest p-space-lg shadow-level-2"
          >
            <div className="flex items-center justify-between gap-space-sm">
              <div className="flex items-center gap-space-sm">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-on-primary">
                  <Icon name="person" filled size={28} />
                </span>
                <div>
                  <h2
                    data-testid="profile-name"
                    className="type-title-lg text-ink-navy-deep"
                  >
                    {profile?.displayName ?? session.user.displayName}
                  </h2>
                  <p
                    data-testid="profile-username"
                    className="type-body-md text-on-surface-variant"
                  >
                    @{profile?.username ?? session.user.username}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-space-xs text-center">
              <div className="rounded-md bg-surface-sky-tint p-space-sm">
                <span className="type-label-sm text-on-surface-variant">
                  Jugados
                </span>
                <p
                  data-testid="profile-played"
                  className="type-headline-sm text-ink-navy-deep"
                >
                  {profile?.totalPlayed ?? 0}
                </p>
              </div>
              <div className="rounded-md bg-secondary-container p-space-sm text-on-secondary-container">
                <span className="type-label-sm">Victorias</span>
                <p data-testid="profile-wins" className="type-headline-sm">
                  {profile?.totalWins ?? 0}
                </p>
              </div>
              <div className="rounded-md bg-tertiary-fixed p-space-sm text-on-tertiary-fixed">
                <span className="type-label-sm">Fair Play</span>
                <p data-testid="profile-fair-play" className="type-headline-sm">
                  {profile?.credibility.score ??
                    session.user.credibilityScore ??
                    100}
                  %
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSession(null)}
              data-testid="logout-button"
              className="type-label-md touch-target inline-flex items-center justify-center gap-space-xs rounded-lg px-space-md btn-3d btn-3d--soft"
            >
              <Icon name="logout" size={18} />
              <span>Cerrar sesión</span>
            </button>
          </section>
        </>
      )}
    </div>
  );
}
