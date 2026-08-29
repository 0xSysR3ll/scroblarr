import { randomUUID } from "crypto";

import { ISyncClient, SyncOptions } from "@integrations/common/ISyncClient";
import { MediaEvent } from "@scroblarr/shared";
import { logger } from "@utils/logger";

import { BingersApiError, bingersErrorFromResponse } from "./BingersApiError";
import {
  BINGERS_API_BASE,
  BingersCatalogResolver,
  BingersEntityKind,
} from "./BingersCatalogResolver";

interface RemoteEntryState {
  watched: boolean;
  plays: number;
}

export class BingersClient implements ISyncClient {
  private static readonly FETCH_TIMEOUT_MS = 30_000;
  private static readonly entityLocks = new Map<string, Promise<unknown>>();

  private readonly catalog: BingersCatalogResolver;

  constructor(catalog: BingersCatalogResolver = new BingersCatalogResolver()) {
    this.catalog = catalog;
  }

  getName(): string {
    return "Bingers";
  }

  async scrobble(
    event: MediaEvent,
    cookieHeader: string,
    options?: SyncOptions
  ): Promise<void> {
    if (!cookieHeader.trim()) {
      throw new BingersApiError("Bingers session cookie is required", 401, {
        isAuthError: true,
      });
    }

    if (event.media.type !== "movie" && event.media.type !== "episode") {
      throw new Error(`Unsupported media type: ${event.media.type}`);
    }

    const entity = await this.catalog.resolveEntity(event.media);
    const isRewatch =
      event.media.type === "movie"
        ? !!options?.markMoviesAsRewatched
        : !!options?.markEpisodesAsRewatched;

    const lockKey = `${cookieHeader}:${entity.entityKind}:${entity.entityId}`;
    await BingersClient.withEntityLock(lockKey, async () => {
      const remote = await this.fetchRemoteEntry(
        cookieHeader,
        entity.entityKind,
        entity.entityId
      );
      const { plays, skip } = this.computePlays(
        remote,
        isRewatch,
        options?.bingersLocalPlayCount
      );

      if (skip) {
        logger.bingers.debug(
          {
            entityKind: entity.entityKind,
            entityId: entity.entityId,
            remotePlays: remote?.plays,
          },
          "Skipping Bingers push; entry is already watched remotely"
        );
        return;
      }

      const body = {
        clientBatchId: randomUUID(),
        ops: [
          {
            opId: randomUUID(),
            table: "entries",
            pk: {
              entityKind: entity.entityKind,
              entityId: entity.entityId,
            },
            fields: {
              watched: true,
              plays,
              batchId: null,
            },
          },
        ],
      };

      logger.bingers.debug(
        {
          entityKind: entity.entityKind,
          entityId: entity.entityId,
          titleId: entity.titleId,
          title: event.media.title,
          plays,
          remotePlays: remote?.plays,
          rewatch: isRewatch,
        },
        "Pushing Bingers watched entry"
      );

      await this.push(cookieHeader, body);
    });
  }

  private computePlays(
    remote: RemoteEntryState | null,
    isRewatch: boolean,
    localPlayTarget?: number
  ): { plays: number; skip: boolean } {
    const remotePlays =
      typeof remote?.plays === "number" && remote.plays > 0 ? remote.plays : 0;
    const remoteWatched = !!remote?.watched;

    if (!isRewatch) {
      if (remoteWatched && remotePlays >= 1) {
        return { plays: remotePlays, skip: true };
      }
      return { plays: 1, skip: false };
    }

    const localTarget =
      typeof localPlayTarget === "number" && localPlayTarget > 0
        ? Math.floor(localPlayTarget)
        : 2;

    return {
      plays: Math.max(localTarget, remotePlays + 1),
      skip: false,
    };
  }

  private async fetchRemoteEntry(
    cookieHeader: string,
    entityKind: BingersEntityKind,
    entityId: string
  ): Promise<RemoteEntryState | null> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      BingersClient.FETCH_TIMEOUT_MS
    );

    const url = new URL(`${BINGERS_API_BASE}/sync/pull`);
    url.searchParams.set("domains", "entries");
    url.searchParams.set("entityKind", entityKind);
    url.searchParams.set("entityId", entityId);

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Accept: "application/json",
          Origin: "https://bingers.app",
          Cookie: cookieHeader,
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        logger.bingers.debug(
          { status: response.status, entityKind, entityId },
          "Bingers entry pull failed; assuming no remote entry"
        );
        return null;
      }

      const body = (await response.json()) as {
        entries?: Array<{
          entityKind?: string;
          entityId?: string;
          watched?: boolean;
          plays?: number;
        }>;
      };

      const entry = body.entries?.find(
        (candidate) =>
          candidate.entityKind === entityKind && candidate.entityId === entityId
      );
      if (!entry) {
        return null;
      }

      return {
        watched: !!entry.watched,
        plays:
          typeof entry.plays === "number" && entry.plays > 0 ? entry.plays : 0,
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        logger.bingers.debug(
          { entityKind, entityId },
          "Timed out fetching remote Bingers entry; assuming no remote entry"
        );
        return null;
      }
      logger.bingers.debug(
        { error, entityKind, entityId },
        "Failed to fetch remote Bingers entry; assuming no remote entry"
      );
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private static async withEntityLock<T>(
    key: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const previous = BingersClient.entityLocks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const current = previous.then(() => gate);
    BingersClient.entityLocks.set(key, current);

    await previous;
    try {
      return await fn();
    } finally {
      release();
      if (BingersClient.entityLocks.get(key) === current) {
        BingersClient.entityLocks.delete(key);
      }
    }
  }

  private async push(
    cookieHeader: string,
    body: Record<string, unknown>
  ): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      BingersClient.FETCH_TIMEOUT_MS
    );

    try {
      const response = await fetch(`${BINGERS_API_BASE}/sync/push`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Origin: "https://bingers.app",
          Cookie: cookieHeader,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (response.status === 401 || response.status === 403) {
        const text = await response.text().catch(() => "");
        throw bingersErrorFromResponse(response.status, text);
      }

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw bingersErrorFromResponse(response.status, text);
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const payload = (await response.json().catch(() => null)) as {
          error?: { code?: string; message?: string };
        } | null;
        if (payload?.error) {
          throw bingersErrorFromResponse(
            response.status,
            JSON.stringify(payload)
          );
        }
      }
    } catch (error) {
      if (error instanceof BingersApiError) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Bingers sync/push timed out");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
