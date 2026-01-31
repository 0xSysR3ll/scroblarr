import { Repository, FindOptionsWhere } from "typeorm";
import { dataSource } from "@config/database";
import { SyncHistory } from "@entities/SyncHistory";

export class SyncHistoryRepository {
  private repository: Repository<SyncHistory>;

  constructor() {
    this.repository = dataSource.getRepository(SyncHistory);
  }

  async create(history: Partial<SyncHistory>): Promise<SyncHistory> {
    const newHistory = this.repository.create(history);
    return this.repository.save(newHistory);
  }

  async findRecent(limit: number): Promise<SyncHistory[]> {
    return this.repository.find({
      relations: ["user"],
      order: {
        syncedAt: "DESC",
      },
      take: limit,
    });
  }

  async findByUser(userId: string, limit: number): Promise<SyncHistory[]> {
    return this.repository.find({
      where: { userId },
      relations: ["user"],
      order: {
        syncedAt: "DESC",
      },
      take: limit,
    });
  }

  async findByUserPaginated(
    userId: string,
    page: number,
    pageSize: number,
    filters?: {
      mediaType?: string;
      success?: boolean;
      source?: string;
    },
    sortBy: string = "syncedAt",
    sortOrder: "ASC" | "DESC" = "DESC"
  ): Promise<{ data: SyncHistory[]; total: number }> {
    const where: FindOptionsWhere<SyncHistory> = { userId };

    if (filters?.mediaType) {
      where.mediaType = filters.mediaType;
    }

    if (filters?.success !== undefined) {
      where.success = filters.success;
    }

    if (
      filters?.source &&
      (filters.source === "plex" || filters.source === "jellyfin")
    ) {
      where.source = filters.source;
    }

    const validSortFields = ["syncedAt", "mediaTitle", "mediaType", "success"];
    const sortField = validSortFields.includes(sortBy) ? sortBy : "syncedAt";
    const order = sortOrder === "ASC" ? "ASC" : "DESC";

    const [data, total] = await this.repository.findAndCount({
      where,
      relations: ["user"],
      order: {
        [sortField]: order,
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return { data, total };
  }

  async count(): Promise<number> {
    return this.repository.count();
  }

  async countByUser(userId: string): Promise<number> {
    return this.repository.count({ where: { userId } });
  }

  async clearOldByUser(userId: string, keepCount: number): Promise<number> {
    const total = await this.countByUser(userId);
    if (total <= keepCount) {
      return 0;
    }

    const toDelete = total - keepCount;
    const oldest = await this.repository.find({
      where: { userId },
      order: {
        syncedAt: "ASC",
      },
      take: toDelete,
    });

    if (oldest.length > 0) {
      await this.repository.remove(oldest);
      return oldest.length;
    }
    return 0;
  }

  async clearByUser(userId: string): Promise<void> {
    await this.repository.delete({ userId });
  }

  async findById(id: string, userId?: string): Promise<SyncHistory | null> {
    const where: FindOptionsWhere<SyncHistory> = { id };
    if (userId) {
      where.userId = userId;
    }
    return this.repository.findOne({
      where,
      relations: ["user"],
    });
  }

  async deleteById(id: string, userId: string): Promise<boolean> {
    const result = await this.repository.delete({ id, userId });
    return (result.affected || 0) > 0;
  }

  async deleteByIds(ids: string[], userId: string): Promise<number> {
    const result = await this.repository
      .createQueryBuilder()
      .delete()
      .where("id IN (:...ids)", { ids })
      .andWhere("userId = :userId", { userId })
      .execute();
    return result.affected || 0;
  }

  async clearAll(): Promise<void> {
    await this.repository.clear();
  }

  async hasExistingSync(
    userId: string,
    mediaType: "episode" | "movie",
    identifiers: {
      tvdbEpisodeId?: string;
      tvdbMovieId?: string;
      imdbMovieId?: string;
      imdbEpisodeId?: string;
    }
  ): Promise<boolean> {
    const where: FindOptionsWhere<SyncHistory> = {
      userId,
      mediaType,
      success: true,
    };

    if (mediaType === "episode") {
      if (identifiers.tvdbEpisodeId) {
        where.tvdbEpisodeId = identifiers.tvdbEpisodeId;
        const existing = await this.repository.findOne({ where });
        if (existing) return true;
      }
      if (identifiers.imdbEpisodeId) {
        where.tvdbEpisodeId = undefined;
        where.imdbEpisodeId = identifiers.imdbEpisodeId;
        const existing = await this.repository.findOne({ where });
        if (existing) return true;
      }
    }

    if (mediaType === "movie") {
      if (identifiers.tvdbMovieId) {
        where.tvdbMovieId = identifiers.tvdbMovieId;
        const existing = await this.repository.findOne({ where });
        if (existing) return true;
      }
      if (identifiers.imdbMovieId) {
        where.tvdbMovieId = undefined;
        where.imdbMovieId = identifiers.imdbMovieId;
        const existing = await this.repository.findOne({ where });
        if (existing) return true;
      }
    }

    return false;
  }

  async getStatisticsByUser(userId: string): Promise<{
    total: number;
    successful: number;
    failed: number;
    successRate: number;
    byMediaType: {
      episode: number;
      movie: number;
      series: number;
    };
    bySource: {
      plex: number;
      jellyfin: number;
    };
    byDestination: {
      trakt: number;
      tvtime: number;
    };
    byPeriod: {
      today: number;
      thisWeek: number;
      thisMonth: number;
      lastMonth: number;
    };
    topThisMonth: Array<{
      mediaTitle: string;
      mediaType: string;
      count: number;
    }>;
    last30Days: {
      total: number;
      successful: number;
      failed: number;
    };
    averages: {
      perDay: number;
      perWeek: number;
      perMonth: number;
    };
    lastSyncedAt: string | null;
    last7Days: number[];
    peakDay: number | null;
    lastFailure: { mediaTitle: string; syncedAt: string } | null;
  }> {
    const now = new Date();

    const startOfToday = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    );
    const utcDay = now.getUTCDay();
    const daysToMonday = utcDay === 0 ? 6 : utcDay - 1;
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setUTCDate(now.getUTCDate() - daysToMonday);
    const startOfMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
    );
    const startOfLastMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)
    );
    const startOfYear = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    const startOf30DaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const last7DaysStarts: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfToday);
      d.setUTCDate(now.getUTCDate() - i);
      last7DaysStarts.push(d);
    }

    const [
      total,
      successful,
      failed,
      episodes,
      movies,
      seriesRaw,
      plexCount,
      jellyfinCount,
      traktCount,
      tvtimeCount,
      today,
      thisWeek,
      thisMonth,
      lastMonth,
      topThisMonthRaw,
      last30DaysTotal,
      last30DaysSuccessful,
      last30DaysFailed,
      thisYear,
      latest,
      lastFailureRow,
      recentForPeakDay,
      ...last7DaysCounts
    ] = await Promise.all([
      this.repository.count({ where: { userId } }),
      this.repository.count({ where: { userId, success: true } }),
      this.repository.count({ where: { userId, success: false } }),
      this.repository.count({ where: { userId, mediaType: "episode" } }),
      this.repository.count({ where: { userId, mediaType: "movie" } }),
      this.repository
        .createQueryBuilder("sync_history")
        .select(
          "COUNT(DISTINCT COALESCE(sync_history.tmdbSeriesId, sync_history.mediaTitle))",
          "count"
        )
        .where("sync_history.userId = :userId", { userId })
        .andWhere("sync_history.mediaType = :mediaType", {
          mediaType: "episode",
        })
        .getRawOne<{ count: string }>(),
      this.repository.count({
        where: { userId, source: "plex" },
      }),
      this.repository.count({
        where: { userId, source: "jellyfin" },
      }),
      this.repository
        .createQueryBuilder("sync_history")
        .where("sync_history.userId = :userId", { userId })
        .andWhere("sync_history.destinations LIKE :traktPat", {
          traktPat: '%"trakt"%',
        })
        .getCount(),
      this.repository
        .createQueryBuilder("sync_history")
        .where("sync_history.userId = :userId", { userId })
        .andWhere("sync_history.destinations LIKE :tvtimePat", {
          tvtimePat: '%"tvtime"%',
        })
        .getCount(),
      this.repository
        .createQueryBuilder("sync_history")
        .where("sync_history.userId = :userId", { userId })
        .andWhere("sync_history.syncedAt >= :startOfToday", { startOfToday })
        .getCount(),
      this.repository
        .createQueryBuilder("sync_history")
        .where("sync_history.userId = :userId", { userId })
        .andWhere("sync_history.syncedAt >= :startOfWeek", { startOfWeek })
        .getCount(),
      this.repository
        .createQueryBuilder("sync_history")
        .where("sync_history.userId = :userId", { userId })
        .andWhere("sync_history.syncedAt >= :startOfMonth", { startOfMonth })
        .getCount(),
      this.repository
        .createQueryBuilder("sync_history")
        .where("sync_history.userId = :userId", { userId })
        .andWhere("sync_history.syncedAt >= :startOfLastMonth", {
          startOfLastMonth,
        })
        .andWhere("sync_history.syncedAt < :startOfMonth", { startOfMonth })
        .getCount(),
      this.repository
        .createQueryBuilder("sync_history")
        .select("sync_history.mediaTitle", "mediaTitle")
        .addSelect("sync_history.mediaType", "mediaType")
        .addSelect("COUNT(*)", "count")
        .where("sync_history.userId = :userId", { userId })
        .andWhere("sync_history.syncedAt >= :startOfMonthTop", {
          startOfMonthTop: startOfMonth,
        })
        .groupBy("sync_history.mediaTitle")
        .addGroupBy("sync_history.mediaType")
        .orderBy("count", "DESC")
        .limit(3)
        .getRawMany<{ mediaTitle: string; mediaType: string; count: string }>(),
      this.repository
        .createQueryBuilder("sync_history")
        .where("sync_history.userId = :userId", { userId })
        .andWhere("sync_history.syncedAt >= :startOf30DaysAgo", {
          startOf30DaysAgo,
        })
        .getCount(),
      this.repository
        .createQueryBuilder("sync_history")
        .where("sync_history.userId = :userId", { userId })
        .andWhere("sync_history.syncedAt >= :startOf30DaysAgo", {
          startOf30DaysAgo,
        })
        .andWhere("sync_history.success = :success", { success: true })
        .getCount(),
      this.repository
        .createQueryBuilder("sync_history")
        .where("sync_history.userId = :userId", { userId })
        .andWhere("sync_history.syncedAt >= :startOf30DaysAgo", {
          startOf30DaysAgo,
        })
        .andWhere("sync_history.success = :successFalse", {
          successFalse: false,
        })
        .getCount(),
      this.repository
        .createQueryBuilder("sync_history")
        .where("sync_history.userId = :userId", { userId })
        .andWhere("sync_history.syncedAt >= :startOfYear", { startOfYear })
        .getCount(),
      this.repository.findOne({
        where: { userId },
        order: { syncedAt: "DESC" },
      }),
      this.repository.findOne({
        where: { userId, success: false },
        order: { syncedAt: "DESC" },
        select: ["mediaTitle", "syncedAt"],
      }),
      this.repository.find({
        where: { userId },
        select: ["syncedAt"],
        order: { syncedAt: "DESC" },
        take: 2000,
      }),
      ...last7DaysStarts.map((startOfDay) => {
        const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
        return this.repository
          .createQueryBuilder("sync_history")
          .where("sync_history.userId = :userId", { userId })
          .andWhere("sync_history.syncedAt >= :start", { start: startOfDay })
          .andWhere("sync_history.syncedAt < :end", { end: endOfDay })
          .getCount();
      }),
    ]);

    const successRate = total > 0 ? (successful / total) * 100 : 0;

    const daysElapsedThisYear =
      Math.floor(
        (now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)
      ) + 1;

    let avgPerDay = 0;
    if (daysElapsedThisYear > 0 && thisYear > 0) {
      avgPerDay = thisYear / daysElapsedThisYear;
    }

    const avgPerWeek = avgPerDay * 7;
    const avgPerMonth = avgPerDay * 30.44; // Average days per month

    const last7Days = (last7DaysCounts as number[]).slice(0, 7);

    const dayCounts = [0, 0, 0, 0, 0, 0, 0];
    const recentList = Array.isArray(recentForPeakDay) ? recentForPeakDay : [];
    for (const row of recentList) {
      const d = (row.syncedAt as Date).getUTCDay();
      dayCounts[d]++;
    }
    const maxCount = Math.max(...dayCounts);
    const peakDay = maxCount > 0 ? dayCounts.indexOf(maxCount) : null;

    return {
      total,
      successful,
      failed,
      successRate: Math.round(successRate * 100) / 100,
      byMediaType: {
        episode: episodes,
        movie: movies,
        series: Number((seriesRaw as { count?: string } | null)?.count ?? 0),
      },
      bySource: {
        plex: plexCount,
        jellyfin: jellyfinCount,
      },
      byDestination: {
        trakt: traktCount,
        tvtime: tvtimeCount,
      },
      byPeriod: {
        today,
        thisWeek,
        thisMonth,
        lastMonth,
      },
      topThisMonth: (topThisMonthRaw || []).map((row) => ({
        mediaTitle: row.mediaTitle,
        mediaType: row.mediaType,
        count: Number(row.count ?? 0),
      })),
      last30Days: {
        total: last30DaysTotal,
        successful: last30DaysSuccessful,
        failed: last30DaysFailed,
      },
      averages: {
        perDay: Math.round(avgPerDay * 100) / 100,
        perWeek: Math.round(avgPerWeek * 100) / 100,
        perMonth: Math.round(avgPerMonth * 100) / 100,
      },
      lastSyncedAt: latest?.syncedAt ? latest.syncedAt.toISOString() : null,
      last7Days,
      peakDay,
      lastFailure:
        lastFailureRow?.mediaTitle != null && lastFailureRow?.syncedAt != null
          ? {
              mediaTitle: lastFailureRow.mediaTitle,
              syncedAt: (lastFailureRow.syncedAt as Date).toISOString(),
            }
          : null,
    };
  }
}
