import { User } from "@entities/User";

export interface SanitizedUser {
  id: string;
  username?: string;
  plexUsername?: string;
  jellyfinUsername?: string;
  displayName?: string;
  email?: string;
  traktUsername?: string;
  simklUsername?: string;
  isAdmin: boolean;
  enabled: boolean;
  thumb?: string;
  createdAt: Date;
  updatedAt: Date;
}

export function getProxiedThumbUrl(user: User): string | undefined {
  if (user.jellyfinThumb && user.jellyfinUserId) {
    return `/api/v1/avatars/jellyfin/${user.id}`;
  } else if (user.plexThumb) {
    return `/api/v1/avatars/plex/${user.id}`;
  } else if (user.traktThumb) {
    return `/api/v1/avatars/trakt/${user.id}`;
  } else if (user.simklThumb) {
    return `/api/v1/avatars/simkl/${user.id}`;
  }
  return undefined;
}

export function sanitizeUser(user: User): SanitizedUser {
  const primaryUsername = user.plexUsername || user.jellyfinUsername;

  return {
    id: user.id,
    username: primaryUsername,
    plexUsername: user.plexUsername,
    jellyfinUsername: user.jellyfinUsername,
    displayName: user.displayName,
    email: user.email,
    traktUsername: user.traktUsername,
    simklUsername: user.simklUsername,
    isAdmin: user.isAdmin,
    enabled: user.enabled,
    thumb: getProxiedThumbUrl(user),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export function sanitizeUsers(users: User[]): SanitizedUser[] {
  return users.map(sanitizeUser);
}
