let adCounter = 0;

export function loadedAd(overrides = {}) {
  const id = overrides.id ?? 123;
  const title = overrides.title ?? `orchestration ad ${++adCounter}`;
  const raw = {
    active: true,
    content_hash: "old",
    created_on: "2026-01-01T00:00:00",
    id,
    price_reduction_count: 2,
    repost_count: 3,
    title,
    updated_on: "2026-01-02T00:00:00",
    ...overrides.raw,
  };
  const ad = {
    active: true,
    contentHash: "old",
    createdOn: new Date("2026-01-01T00:00:00Z"),
    id,
    price: 20,
    priceReductionCount: 2,
    repostCount: 3,
    title,
    updatedOn: new Date("2026-01-02T00:00:00Z"),
    ...overrides.ad,
  };
  return {
    ad,
    filePath: `/tmp/${title}.yaml`,
    raw,
    relativePath: `ads/${title}.yaml`,
  };
}
