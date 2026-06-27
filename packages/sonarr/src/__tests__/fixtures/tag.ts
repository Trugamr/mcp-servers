/**
 * Realistic `GET /api/v3/tag` element. `seriesIds` is unmodeled (verifies
 * key-stripping); the list endpoint itself returns only `id` and `label`.
 */
export const tagFixture = {
  id: 7,
  label: "anime",
  seriesIds: [1, 2, 3],
}
