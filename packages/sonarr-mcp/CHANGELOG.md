# @trugamr/sonarr-mcp

## 0.1.0

### Minor Changes

- [#15](https://github.com/Trugamr/mcp-servers/pull/15) [`942c732`](https://github.com/Trugamr/mcp-servers/commit/942c732cd6c04cefb61ba398ce0e8f7a11ca0b10) Thanks [@Trugamr](https://github.com/Trugamr)! - Initial public release.

- [#28](https://github.com/Trugamr/mcp-servers/pull/28) [`28d0e9d`](https://github.com/Trugamr/mcp-servers/commit/28d0e9d6bb213c4924aef215e7206b811f384eff) Thanks [@Trugamr](https://github.com/Trugamr)! - Surface genres on the library list tools and make them filterable.

  `list_movies` and `list_series` now include each item's `genres`, and gain a `genres` filter with set semantics — positive operators match existentially (`contains: "drama"`, `in: ["Drama", "Sci-Fi"]`), negative operators match universally (`ne` / `nin` exclude any item carrying the genre). Text filters across both servers also gain the `nin` operator.

### Patch Changes

- Updated dependencies [[`942c732`](https://github.com/Trugamr/mcp-servers/commit/942c732cd6c04cefb61ba398ce0e8f7a11ca0b10)]:
  - @trugamr/sonarr@0.1.0
