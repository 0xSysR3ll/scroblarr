import { beforeEach, describe, expect, it, vi } from "vitest";

const countMock = vi.hoisted(() => vi.fn());
const findMock = vi.hoisted(() => vi.fn());
const findOneMock = vi.hoisted(() => vi.fn());
const createMock = vi.hoisted(() => vi.fn());
const saveMock = vi.hoisted(() => vi.fn());
const clearMock = vi.hoisted(() => vi.fn());
const deleteMock = vi.hoisted(() => vi.fn());
const removeMock = vi.hoisted(() => vi.fn());
const createQueryBuilderMock = vi.hoisted(() => vi.fn());

vi.mock("@config/database", () => ({
  dataSource: {
    getRepository: vi.fn(() => ({
      count: countMock,
      find: findMock,
      findOne: findOneMock,
      create: createMock,
      save: saveMock,
      clear: clearMock,
      delete: deleteMock,
      remove: removeMock,
      createQueryBuilder: createQueryBuilderMock,
      findAndCount: vi.fn(),
    })),
  },
}));

import { SyncHistoryRepository } from "./SyncHistoryRepository";

function queryBuilder(result: {
  count?: number;
  rawOne?: unknown;
  rawMany?: unknown;
}) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.select = chain;
  builder.addSelect = chain;
  builder.where = chain;
  builder.andWhere = chain;
  builder.groupBy = chain;
  builder.addGroupBy = chain;
  builder.orderBy = chain;
  builder.limit = chain;
  builder.delete = chain;
  builder.execute = vi.fn().mockResolvedValue({ affected: 0 });
  builder.getCount = vi.fn().mockResolvedValue(result.count ?? 0);
  builder.getRawOne = vi.fn().mockResolvedValue(result.rawOne);
  builder.getRawMany = vi.fn().mockResolvedValue(result.rawMany);
  return builder;
}

describe("SyncHistoryRepository defensive statistics branches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("falls back when peak-day rows are non-arrays and raw aggregates are empty", async () => {
    countMock.mockResolvedValue(0);
    findOneMock.mockResolvedValue(null);
    findMock.mockResolvedValue("not-an-array" as never);

    let qbCalls = 0;
    createQueryBuilderMock.mockImplementation(() => {
      qbCalls += 1;
      if (qbCalls === 1) {
        return queryBuilder({ rawOne: null });
      }
      if (qbCalls === 10) {
        return queryBuilder({
          rawMany: [
            {
              mediaTitle: "Ghost",
              mediaType: "movie",
              count: null,
            },
          ],
        });
      }
      return queryBuilder({ count: 0, rawMany: null });
    });

    const repository = new SyncHistoryRepository();
    const stats = await repository.getStatisticsByUser("user-1");

    expect(stats.peakDay).toBeNull();
    expect(stats.byMediaType.series).toBe(0);
    expect(stats.topThisMonth).toEqual([
      { mediaTitle: "Ghost", mediaType: "movie", count: 0 },
    ]);
    expect(stats.lastSyncedAt).toBeNull();
    expect(stats.lastFailure).toBeNull();
  });

  it("uses an empty topThisMonth list when rawMany is falsy", async () => {
    countMock.mockResolvedValue(0);
    findOneMock.mockResolvedValue(null);
    findMock.mockResolvedValue([]);

    createQueryBuilderMock.mockImplementation(() =>
      queryBuilder({
        count: 0,
        rawOne: { count: undefined },
        rawMany: undefined,
      })
    );

    const repository = new SyncHistoryRepository();
    const stats = await repository.getStatisticsByUser("user-1");

    expect(stats.topThisMonth).toEqual([]);
    expect(stats.byMediaType.series).toBe(0);
  });
});
