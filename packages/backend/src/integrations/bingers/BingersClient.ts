import { randomUUID } from "crypto";

import { ISyncClient, SyncOptions } from "@integrations/common/ISyncClient";
import { MediaEvent } from "@scroblarr/shared";
import { logger } from "@utils/logger";

import { BingersApiError, bingersErrorFromResponse } from "./BingersApiError";
import {
  BINGERS_API_BASE,
  BingersCatalogResolver,
} from "./BingersCatalogResolver";

export class BingersClient implements ISyncClient {
  private static readonly FETCH_TIMEOUT_MS = 30_000;
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

    const plays =
      typeof options?.plays === "number" && options.plays > 0
        ? Math.floor(options.plays)
        : 1;

    const entity = await this.catalog.resolveEntity(event.media);
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
        rewatch:
          event.media.type === "movie"
            ? !!options?.markMoviesAsRewatched
            : !!options?.markEpisodesAsRewatched,
      },
      "Pushing Bingers watched entry"
    );

    await this.push(cookieHeader, body);
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
