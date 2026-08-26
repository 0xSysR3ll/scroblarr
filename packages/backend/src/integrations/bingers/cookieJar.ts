export interface CookieEntry {
  name: string;
  value: string;
  expires?: number;
}

export type CookieJar = Record<string, CookieEntry>;

export function emptyCookieJar(): CookieJar {
  return {};
}

export function serializeCookieJar(jar: CookieJar): string {
  return JSON.stringify(jar);
}

export function parseCookieJar(raw: string): CookieJar {
  if (!raw.trim()) {
    return emptyCookieJar();
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return emptyCookieJar();
    }

    const jar: CookieJar = {};
    for (const [name, entry] of Object.entries(
      parsed as Record<string, unknown>
    )) {
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const value = (entry as { value?: unknown }).value;
      if (typeof value !== "string") {
        continue;
      }
      const expires = (entry as { expires?: unknown }).expires;
      jar[name] = {
        name,
        value,
        expires: typeof expires === "number" ? expires : undefined,
      };
    }
    return jar;
  } catch {
    return emptyCookieJar();
  }
}

export function cookieHeaderFromJar(jar: CookieJar): string {
  const now = Date.now();
  return Object.values(jar)
    .filter((entry) => !entry.expires || entry.expires > now)
    .map((entry) => `${entry.name}=${entry.value}`)
    .join("; ");
}

/**
 * Merge Set-Cookie header values into an existing jar.
 * Supports multiple Set-Cookie headers and comma-joined forms from fetch.
 */
export function mergeSetCookieHeaders(
  jar: CookieJar,
  setCookieHeaders: string[]
): CookieJar {
  const next: CookieJar = { ...jar };

  for (const header of setCookieHeaders) {
    for (const part of splitSetCookieHeader(header)) {
      const entry = parseSingleSetCookie(part);
      if (!entry) {
        continue;
      }
      if (entry.value === "" || /deleted/i.test(entry.value)) {
        delete next[entry.name];
        continue;
      }
      next[entry.name] = entry;
    }
  }

  return next;
}

function splitSetCookieHeader(header: string): string[] {
  // fetch may join multiple Set-Cookie with ", " — split carefully on
  // commas that precede a new cookie name=value pair.
  const parts: string[] = [];
  let current = "";
  for (const segment of header.split(/,(?=\s*[^;=]+=[^;]*)/)) {
    if (!current) {
      current = segment.trim();
      continue;
    }
    // If prior segment looks incomplete (Expires=Thu, 01-Jan...), append.
    if (/Expires=/i.test(current) && !/;\s*$/.test(current)) {
      current = `${current},${segment}`;
    } else {
      parts.push(current);
      current = segment.trim();
    }
  }
  if (current) {
    parts.push(current);
  }
  return parts.length > 0 ? parts : [header];
}

function parseSingleSetCookie(raw: string): CookieEntry | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const [pair, ...attrs] = trimmed.split(";");
  const eq = pair.indexOf("=");
  if (eq <= 0) {
    return null;
  }

  const name = pair.slice(0, eq).trim();
  const value = pair.slice(eq + 1).trim();
  if (!name) {
    return null;
  }

  let expires: number | undefined;
  for (const attr of attrs) {
    const [attrName, attrValue] = attr.split("=").map((s) => s.trim());
    if (/^Expires$/i.test(attrName) && attrValue) {
      const ms = Date.parse(attrValue);
      if (!Number.isNaN(ms)) {
        expires = ms;
      }
    }
    if (/^Max-Age$/i.test(attrName) && attrValue) {
      const seconds = Number(attrValue);
      if (Number.isFinite(seconds)) {
        expires = Date.now() + seconds * 1000;
      }
    }
  }

  return { name, value, expires };
}

export function collectSetCookieHeaders(response: Response): string[] {
  const headers = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }

  const single = response.headers.get("set-cookie");
  return single ? [single] : [];
}
