import {
  BINGERS_REAUTH_MESSAGE,
  BingersApiError,
  bingersErrorFromResponse,
  isBingersAuthError,
} from "./BingersApiError";
import {
  CookieJar,
  collectSetCookieHeaders,
  cookieHeaderFromJar,
  emptyCookieJar,
  mergeSetCookieHeaders,
} from "./cookieJar";

export const BINGERS_API_BASE = "https://api.bingers.app";
export const BINGERS_AUTH_BASE = `${BINGERS_API_BASE}/auth`;

export interface BingersSessionUser {
  id?: string;
  email?: string;
  name?: string;
  username?: string;
  image?: string;
}

export interface BingersSessionInfo {
  session: Record<string, unknown> | null;
  user: BingersSessionUser | null;
  expiresAt?: number;
  cookieJar: CookieJar;
}

export interface BingersMeProfile {
  userId?: string;
  username?: string;
  image?: string;
}

export class BingersAuth {
  async verifyMagicLink(token: string): Promise<BingersSessionInfo> {
    const url = new URL(`${BINGERS_AUTH_BASE}/magic-link/verify`);
    url.searchParams.set("token", token);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        Origin: "https://bingers.app",
      },
      redirect: "manual",
    });

    const jar = mergeSetCookieHeaders(
      emptyCookieJar(),
      collectSetCookieHeaders(response)
    );

    // Some better-auth setups redirect after verify; follow once with cookies.
    if (
      response.status >= 300 &&
      response.status < 400 &&
      Object.keys(jar).length > 0
    ) {
      return this.getSession(jar);
    }

    if (!response.ok && response.status !== 0) {
      // Node fetch with redirect:manual may still return 200 with cookies.
      if (Object.keys(jar).length === 0) {
        const text = await response.text().catch(() => "");
        throw bingersErrorFromResponse(response.status || 400, text);
      }
    }

    if (Object.keys(jar).length === 0) {
      throw new BingersApiError(
        "Magic-link verify did not return session cookies",
        response.status || 400
      );
    }

    return this.getSession(jar);
  }

  async getSession(cookieJar: CookieJar): Promise<BingersSessionInfo> {
    const cookieHeader = cookieHeaderFromJar(cookieJar);
    if (!cookieHeader) {
      throw new BingersApiError(BINGERS_REAUTH_MESSAGE, 401, {
        isAuthError: true,
      });
    }

    const response = await fetch(`${BINGERS_AUTH_BASE}/get-session`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Origin: "https://bingers.app",
        Cookie: cookieHeader,
      },
    });

    let mergedJar = mergeSetCookieHeaders(
      cookieJar,
      collectSetCookieHeaders(response)
    );

    if (response.status === 401 || response.status === 403) {
      throw new BingersApiError(BINGERS_REAUTH_MESSAGE, response.status, {
        isAuthError: true,
      });
    }

    if (!response.ok) {
      const text = await response.text();
      throw bingersErrorFromResponse(response.status, text);
    }

    const body = (await response.json()) as unknown;
    if (body === null) {
      throw new BingersApiError(BINGERS_REAUTH_MESSAGE, 401, {
        isAuthError: true,
      });
    }

    const { session, user, expiresAt } = normalizeSessionPayload(body);
    if (!session && !user) {
      throw new BingersApiError(BINGERS_REAUTH_MESSAGE, 401, {
        isAuthError: true,
      });
    }

    let enrichedUser = user;
    try {
      const me = await this.getMe(mergedJar);
      mergedJar = me.cookieJar;
      enrichedUser = mergeUserWithMe(user, me.profile);
    } catch (error) {
      // Profile enrichment is best-effort; session cookies remain valid.
      if (isBingersAuthError(error)) {
        throw error;
      }
    }

    return {
      session,
      user: enrichedUser,
      expiresAt,
      cookieJar: mergedJar,
    };
  }

  async getMe(
    cookieJar: CookieJar
  ): Promise<{ profile: BingersMeProfile; cookieJar: CookieJar }> {
    const cookieHeader = cookieHeaderFromJar(cookieJar);
    if (!cookieHeader) {
      throw new BingersApiError(BINGERS_REAUTH_MESSAGE, 401, {
        isAuthError: true,
      });
    }

    const response = await fetch(`${BINGERS_API_BASE}/me`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Origin: "https://bingers.app",
        Cookie: cookieHeader,
      },
    });

    const mergedJar = mergeSetCookieHeaders(
      cookieJar,
      collectSetCookieHeaders(response)
    );

    if (response.status === 401 || response.status === 403) {
      throw new BingersApiError(BINGERS_REAUTH_MESSAGE, response.status, {
        isAuthError: true,
      });
    }

    if (!response.ok) {
      const text = await response.text();
      throw bingersErrorFromResponse(response.status, text);
    }

    const body = (await response.json()) as unknown;
    return {
      profile: normalizeMePayload(body),
      cookieJar: mergedJar,
    };
  }
}

export function extractMagicLinkToken(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new BingersApiError("Magic-link token is required", 400);
  }

  // Raw token (no URL structure)
  if (!/[/?#=]/.test(trimmed) && !trimmed.includes("://")) {
    return trimmed;
  }

  try {
    const withProtocol = trimmed.includes("://")
      ? trimmed
      : `https://placeholder.local/${trimmed.replace(/^\//, "")}`;
    const url = new URL(withProtocol);
    const token =
      url.searchParams.get("token") || url.searchParams.get("magic_link_token");
    if (token?.trim()) {
      return token.trim();
    }
  } catch {
    // Fall through to regex extraction.
  }

  const match = trimmed.match(/[?&#]token=([^&#\s]+)/i);
  if (match?.[1]) {
    return decodeURIComponent(match[1]);
  }

  throw new BingersApiError(
    "Could not extract a magic-link token from the provided value",
    400
  );
}

function normalizeSessionPayload(body: unknown): {
  session: Record<string, unknown> | null;
  user: BingersSessionUser | null;
  expiresAt?: number;
} {
  if (!body || typeof body !== "object") {
    return { session: null, user: null };
  }

  const record = body as Record<string, unknown>;

  // better-auth typically: { session: {...}, user: {...} }
  const sessionObj =
    record.session && typeof record.session === "object"
      ? (record.session as Record<string, unknown>)
      : record.id && (record.expiresAt || record.expires)
        ? record
        : null;

  const userRaw =
    record.user && typeof record.user === "object"
      ? (record.user as Record<string, unknown>)
      : null;

  const user: BingersSessionUser | null = userRaw
    ? {
        id: typeof userRaw.id === "string" ? userRaw.id : undefined,
        email: typeof userRaw.email === "string" ? userRaw.email : undefined,
        name: typeof userRaw.name === "string" ? userRaw.name : undefined,
        username:
          typeof userRaw.username === "string" ? userRaw.username : undefined,
        image: typeof userRaw.image === "string" ? userRaw.image : undefined,
      }
    : null;

  const expiresAt = parseExpiresAt(
    sessionObj?.expiresAt ??
      sessionObj?.expires ??
      record.expiresAt ??
      record.expires
  );

  return {
    session: sessionObj,
    user,
    expiresAt,
  };
}

function normalizeMePayload(body: unknown): BingersMeProfile {
  if (!body || typeof body !== "object") {
    return {};
  }

  const record = body as Record<string, unknown>;
  const user =
    record.user && typeof record.user === "object"
      ? (record.user as Record<string, unknown>)
      : null;
  const profile =
    record.profile && typeof record.profile === "object"
      ? (record.profile as Record<string, unknown>)
      : null;

  const avatarUrl =
    typeof profile?.avatarUrl === "string" && profile.avatarUrl.trim()
      ? profile.avatarUrl.trim()
      : undefined;
  const oauthImage =
    typeof user?.image === "string" && user.image.trim()
      ? user.image.trim()
      : undefined;

  const handle =
    typeof profile?.handle === "string" && profile.handle.trim()
      ? profile.handle.trim()
      : undefined;
  const displayName =
    typeof profile?.displayName === "string" && profile.displayName.trim()
      ? profile.displayName.trim()
      : undefined;
  const name =
    typeof user?.name === "string" && user.name.trim()
      ? user.name.trim()
      : undefined;

  return {
    userId: typeof user?.id === "string" ? user.id : undefined,
    username: handle || displayName || name,
    image: avatarUrl || oauthImage,
  };
}

function mergeUserWithMe(
  user: BingersSessionUser | null,
  me: BingersMeProfile
): BingersSessionUser {
  return {
    id: me.userId || user?.id,
    email: user?.email,
    name: user?.name,
    username: me.username || user?.username || user?.name,
    image: me.image || user?.image,
  };
}

function parseExpiresAt(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    // Heuristic: seconds vs ms
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value === "string" && value.trim()) {
    const ms = Date.parse(value);
    if (!Number.isNaN(ms)) {
      return ms;
    }
  }
  return undefined;
}
