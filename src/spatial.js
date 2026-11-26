// Uniform grid for neighbour queries, so crowd separation and bullet hits are not O(n^2).
// Rebuild each tick with build(list); near() then returns candidate indices from the
// 3x3 cells around a point. With cell >= the largest interaction distance, every entity
// within one cell size of the point is a candidate.
export function createGrid(worldW, worldH, cell) {
  const cols = Math.ceil(worldW / cell);
  const rows = Math.ceil(worldH / cell);
  const head = new Int32Array(cols * rows);
  let next = new Int32Array(256);
  const col = (x) => Math.min(cols - 1, Math.max(0, Math.floor(x / cell)));
  const row = (y) => Math.min(rows - 1, Math.max(0, Math.floor(y / cell)));
  return {
    build(list) {
      head.fill(-1);
      if (next.length < list.length) next = new Int32Array(list.length * 2);
      for (let i = 0; i < list.length; i++) {
        const c = row(list[i].y) * cols + col(list[i].x);
        next[i] = head[c];
        head[c] = i;
      }
    },
    // Fills and returns `out` with indices near (x, y). Order is unspecified.
    near(x, y, out) {
      out.length = 0;
      const c0 = col(x);
      const r0 = row(y);
      for (let r = Math.max(0, r0 - 1); r <= Math.min(rows - 1, r0 + 1); r++) {
        for (let c = Math.max(0, c0 - 1); c <= Math.min(cols - 1, c0 + 1); c++) {
          for (let i = head[r * cols + c]; i !== -1; i = next[i]) out.push(i);
        }
      }
      return out;
    },
  };
}
