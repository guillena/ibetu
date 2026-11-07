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

export interface KnownOAuthAccount {
  provider: OAuthProvider;
  email: string;
  displayName: string;
  username?: string;
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
  email?: string | null;
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

export const KNOWN_ACCOUNTS_STORAGE_KEY = "ibetu:known_oauth_accounts";

export function normalizeOAuthEmail(
  provider: OAuthProvider,
  rawInput: string,
): string {
  const trimmed = rawInput.trim().toLowerCase();
  if (!trimmed) return "";
  if (trimmed.includes("@")) return trimmed;
  const defaultDomain = provider === "GOOGLE" ? "gmail.com" : "icloud.com";
  return `${trimmed}@${defaultDomain}`;
}

export function deriveDisplayNameFromEmail(email: string): string {
  const localPart = email.trim().split("@")[0] ?? "";
  const words = localPart
    .split(/[._+-]+/)
    .map((w) => w.trim())
    .filter(Boolean);
  if (words.length === 0) return "Jugador";
  return words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ")
    .slice(0, 40);
}

export function buildOAuthTokenForEmail(
  provider: OAuthProvider,
  rawEmail: string,
  displayNameHint?: string,
): string {
  const email = normalizeOAuthEmail(provider, rawEmail);
  const subKey = email.replace(/[^a-z0-9]/g, "_");
  const displayName =
    displayNameHint?.trim() || deriveDisplayNameFromEmail(email);
  return `dev:${provider}:sub_${provider.toLowerCase()}_${subKey}:${email}:${displayName}`;
}

export function getKnownOAuthAccounts(
  provider?: OAuthProvider,
): KnownOAuthAccount[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KNOWN_ACCOUNTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const valid = parsed.filter(
      (item): item is KnownOAuthAccount =>
        Boolean(
          item &&
            typeof item.email === "string" &&
            (item.provider === "GOOGLE" || item.provider === "APPLE"),
        ),
    );
    return provider ? valid.filter((a) => a.provider === provider) : valid;
  } catch {
    return [];
  }
}

export function saveKnownOAuthAccount(account: KnownOAuthAccount): void {
  if (typeof window === "undefined") return;
  const email = account.email?.trim().toLowerCase();
  if (!email) return;
  try {
    const existing = getKnownOAuthAccounts();
    const filtered = existing.filter((a) => a.email.toLowerCase() !== email);
    const updated: KnownOAuthAccount[] = [
      {
        provider: account.provider,
        email,
        displayName:
          account.displayName?.trim() || deriveDisplayNameFromEmail(email),
        ...(account.username ? { username: account.username } : {}),
      },
      ...filtered,
    ].slice(0, 6);
    window.localStorage.setItem(
      KNOWN_ACCOUNTS_STORAGE_KEY,
      JSON.stringify(updated),
    );
  } catch {
    // Ignorar errores de almacenamiento en modo privado
  }
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
      if (session.user.email) {
        const isApple =
          session.user.email.endsWith("@icloud.com") ||
          session.user.email.endsWith("@privaterelay.appleid.com");
        saveKnownOAuthAccount({
          provider: isApple ? "APPLE" : "GOOGLE",
          email: session.user.email,
          displayName: session.user.displayName,
          username: session.user.username,
        });
      }
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
