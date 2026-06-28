/**
 * `GET /api/v3/rootfolder` payload. `unmappedFolders` is unmodeled; including it
 * verifies `Schema.Struct` drops it from the lean `RootFolder`.
 */
export const rootFoldersFixture = [
  {
    id: 1,
    path: "/movies",
    accessible: true,
    freeSpace: 123_456_789_012,
    unmappedFolders: [],
  },
]
