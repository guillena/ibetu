"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useShell, type FairPlayBand } from "@/components/shell/shell-context";
import { apiFetch } from "@/lib/api";

export interface FriendWithCredibility {
  id: string;
  displayName: string;
  username: string;
  since: string;
  credibility?: {
    score: number;
    band: FairPlayBand;
    provisional: boolean;
  };
}

export function AmigosClient() {
  const { session } = useShell();
  const [friends, setFriends] = useState<FriendWithCredibility[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!session?.accessToken) return;
    let active = true;
    setLoading(true);
    apiFetch<FriendWithCredibility[]>("/friends", {
      token: session.accessToken,
    })
      .then((res) => {
        if (active) setFriends(res);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [session?.accessToken]);

  return (
    <div className="flex flex-col gap-space-md">
      <div>
        <h1 className="type-headline-lg-mobile text-ink-navy-deep">Amigos</h1>
        <p className="type-body-md mt-space-xs text-on-surface-variant">
          Con quienes jugás. Se suman solos cuando aceptan un reto tuyo.
        </p>
      </div>

      {friends.length > 0 ? (
        <ul
          data-testid="friends-list"
          className="flex flex-col gap-space-sm"
        >
          {friends.map((f) => {
            const score = f.credibility?.score ?? 100;
            return (
              <li
                key={f.id}
                data-testid="friend-card"
                className="flex flex-wrap items-center justify-between gap-space-sm rounded-lg bg-surface-container-lowest p-space-md shadow-level-2"
              >
                <div className="flex items-center gap-space-sm">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-on-primary">
                    <Icon name="person" filled size={22} />
                  </span>
                  <div>
                    <h2 className="type-title-md text-ink-navy-deep">
                      {f.displayName}
                    </h2>
                    <p className="type-body-md text-on-surface-variant">
                      @{f.username} ·{" "}
                      <span className="text-secondary">
                        {score}% Fair Play
                      </span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-space-xs">
                  <Link
                    href={`/historial?with=${f.id}`}
                    data-testid={`friend-history-${f.id}`}
                    className="type-label-md touch-target inline-flex items-center justify-center rounded-lg bg-surface-sky-tint px-space-sm text-ink-navy-deep"
                  >
                    Historial
                  </Link>
                  <Link
                    href={`/crear?opponentId=${f.id}`}
                    data-testid={`friend-challenge-${f.id}`}
                    className="type-label-lg touch-target inline-flex items-center justify-center rounded-lg bg-primary-container px-space-md text-on-primary shadow-level-3"
                  >
                    Desafiar
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <section
          data-testid="friends-empty-state"
          className="flex flex-col items-center gap-space-md rounded-lg bg-surface-container-lowest p-space-lg text-center shadow-level-2"
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-sky-tint text-primary-container">
            <Icon name="group" filled size={32} />
          </span>
          <p className="type-body-lg text-on-surface">
            {loading
              ? "Cargando amigos..."
              : "Cuando un amigo acepte un reto tuyo, va a aparecer acá."}
          </p>
          <Link
            href="/crear"
            className="type-label-lg touch-target inline-flex items-center justify-center rounded-lg bg-primary-container px-space-lg text-on-primary shadow-level-3"
          >
            Invitar a un amigo
          </Link>
        </section>
      )}
    </div>
  );
}

