export type CurrencyMode = "COINS" | "CASH";
export type FairPlayBand = "GREEN" | "YELLOW" | "RED";
export type Vote = "WIN" | "LOSS" | "DRAW";
export type ChallengeStatus = "PENDING" | "ACTIVE" | "RESULT" | "DISPUTE" | "CLOSED" | "CANCELLED";
export type OpenTab = "IN_PLAY" | "TO_DECLARE" | "INVITATION_RECEIVED" | "INVITATION_SENT";
export type OpenRole = "CREATOR" | "OPPONENT" | "JUDGE";

export type OAuthProvider = "GOOGLE" | "APPLE";

export interface SessionUser {
  id: string;
  username: string;
  displayName: string;
  email?: string | null;
  coinsAvailable: number;
  credibilityScore: number;
  credibilityStatus: FairPlayBand;
  whatsappLinked?: boolean;
}

export type AuthUser = SessionUser;

export type OAuthVerifyResponse =
  | {
      status: "AUTHENTICATED";
      accessToken: string;
      user: SessionUser;
    }
  | {
      status: "NEEDS_PROFILE";
      onboardingToken: string;
      provider: OAuthProvider;
      email: string;
      suggestedDisplayName: string;
      suggestedUsername: string;
    };

export interface StoredSession {
  accessToken: string;
  user: SessionUser;
}

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
}

export interface OpenChallengeItem {
  id: string;
  inviteCode: string;
  title: string;
  mode: CurrencyMode;
  stakeAmount: number;
  status: ChallengeStatus;
  tab: OpenTab;
  role: OpenRole;
  rival: PublicUser | null;
  players: PublicUser[];
  createdAt: string;
  expiresAt: string;
  pot: number | null;
  actionNeeded: boolean;
  myVote: Vote | null;
  rivalHasVoted: boolean;
  rivalVote: Vote | null;
  silenceDeadline: string | null;
  judge: {
    proposed: boolean;
    assigned: boolean;
    verdictDeadline: string | null;
  } | null;
  shareUrl: string | null;
}

export interface OpenChallengeCounts {
  inPlay: number;
  toDeclare: number;
  toDeclareActionNeeded: number;
  invitationsReceived: number;
  invitationsSent: number;
}

export interface OpenChallengeList {
  items: OpenChallengeItem[];
  counts: OpenChallengeCounts;
}

export interface ProfileView {
  id: string;
  username: string;
  displayName: string;
  memberSince: string;
  isSelf: boolean;
  whatsappLinked?: boolean;
  totalPlayed: number;
  totalWins: number;
  credibility: {
    score: number;
    band: FairPlayBand;
    provisional: boolean;
  };
}

export function buildDevOAuthToken(provider: OAuthProvider): string {
  const domain = provider === "GOOGLE" ? "gmail.com" : "icloud.com";
  if (typeof window !== "undefined") {
    const customToken = window.localStorage.getItem("ibetu:dev_oauth_token");
    if (customToken) return customToken;

    const storageKey = `ibetu:dev_oauth_sub_${provider.toLowerCase()}`;
    let deviceId = window.localStorage.getItem(storageKey);
    if (!deviceId) {
      deviceId = Math.random().toString(36).slice(2, 8);
      window.localStorage.setItem(storageKey, deviceId);
    }
    return `dev:${provider}:sub_${provider.toLowerCase()}_${deviceId}:jugador.${deviceId}@${domain}:Jugador`;
  }
  return `dev:${provider}:sub_${provider.toLowerCase()}:jugador@${domain}:Jugador`;
}

export async function verifyOAuth(
  provider: OAuthProvider,
  idToken?: string,
  displayNameHint?: string,
): Promise<OAuthVerifyResponse> {
  return apiFetch<OAuthVerifyResponse>("/auth/oauth/verify", {
    method: "POST",
    token: null,
    body: JSON.stringify({
      provider,
      idToken: idToken ?? buildDevOAuthToken(provider),
      ...(displayNameHint ? { displayNameHint } : {}),
    }),
  });
}

export async function completeOAuthProfile(input: {
  onboardingToken: string;
  displayName: string;
  username: string;
  inviteCode?: string;
}): Promise<StoredSession> {
  return apiFetch<StoredSession>("/auth/oauth/complete-profile", {
    method: "POST",
    token: null,
    body: JSON.stringify(input),
  });
}

export interface FriendItem {
  id: string;
  displayName: string;
  username: string;
  since: string;
}

export interface ChallengePreset {
  id: string;
  label: string;
  text: string;
}

export const SESSION_STORAGE_KEY = "ibetu:session";

const sessionListeners = new Set<() => void>();
let cachedSessionRaw: string | null = null;
let cachedSessionValue: StoredSession | null = null;

export function subscribeSession(cb: () => void) {
  sessionListeners.add(cb);
  if (typeof window !== "undefined") {
    window.addEventListener("storage", cb);
  }
  return () => {
    sessionListeners.delete(cb);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", cb);
    }
  };
}

export function getStoredSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (raw === cachedSessionRaw) return cachedSessionValue;
    cachedSessionRaw = raw;
    if (!raw) {
      cachedSessionValue = null;
      return null;
    }
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed?.accessToken || !parsed?.user?.id) {
      cachedSessionValue = null;
      return null;
    }
    cachedSessionValue = parsed;
    return parsed;
  } catch {
    return null;
  }
}

export function saveStoredSession(session: StoredSession | null) {
  if (typeof window === "undefined") return;
  try {
    if (session) {
      const raw = JSON.stringify(session);
      window.localStorage.setItem(SESSION_STORAGE_KEY, raw);
      cachedSessionRaw = raw;
      cachedSessionValue = session;
    } else {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
      cachedSessionRaw = null;
      cachedSessionValue = null;
    }
  } catch {
    cachedSessionValue = session;
  }
  sessionListeners.forEach((cb) => cb());
}

export class ApiError extends Error {
  status: number;
  data: Record<string, unknown>;

  constructor(status: number, message: string, data: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const { token, headers, ...rest } = options;
  const authToken = token !== undefined ? token : getStoredSession()?.accessToken ?? null;
  const reqHeaders = new Headers(headers);
  if (authToken) {
    reqHeaders.set("Authorization", `Bearer ${authToken}`);
  }
  if (rest.body && typeof rest.body === "string" && !reqHeaders.has("Content-Type")) {
    reqHeaders.set("Content-Type", "application/json");
  }

  const res = await fetch(`/api${path.startsWith("/") ? path : `/${path}`}`, {
    ...rest,
    headers: reqHeaders,
  });

  const text = await res.text();
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      data = { message: text };
    }
  }

  if (!res.ok) {
    const rawMsg = data.message;
    const msg = Array.isArray(rawMsg)
      ? rawMsg.join(" ")
      : typeof rawMsg === "string"
        ? rawMsg
        : `Error HTTP ${res.status}`;
    throw new ApiError(res.status, msg, data);
  }

  return data as T;
}

