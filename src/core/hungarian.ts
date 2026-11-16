export interface AssignmentResult {
  assignment: number[];
  totalCost: number;
}

/**
 * Solves minimum-cost bipartite assignment in O(n^2 * m) using 1-indexed
 * Jonker-Volgenant / Kuhn-Munkres dual potentials. Fails closed on malformed
 * or non-finite cost matrices.
 */
export function solveMinCostAssignment(costMatrix: number[][]): AssignmentResult {
  const n = costMatrix.length;
  if (n === 0) {
    throw new Error('Assignment costMatrix cannot be empty.');
  }
  const m = costMatrix[0]?.length ?? 0;
  if (m === 0) {
    throw new Error('Assignment costMatrix columns cannot be zero.');
  }
  if (n > m) {
    throw new Error(
      `Assignment requires rows <= cols (got ${n} rows and ${m} cols).`
    );
  }

  for (let i = 0; i < n; i++) {
    const row = costMatrix[i];
    if (!row || row.length !== m) {
      throw new Error(`Row ${i} length mismatch: expected ${m}.`);
    }
    for (let j = 0; j < m; j++) {
      const val = row[j];
      if (val === undefined || !Number.isFinite(val)) {
        throw new Error(`Non-finite cost at (${i}, ${j}): ${String(val)}`);
      }
    }
  }

  const u = new Float64Array(n + 1);
  const v = new Float64Array(m + 1);
  const p = new Int32Array(m + 1);
  const way = new Int32Array(m + 1);

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Float64Array(m + 1).fill(Infinity);
    const used = new Uint8Array(m + 1);

    do {
      used[j0] = 1;
      const i0 = p[j0]!;
      let delta = Infinity;
      let j1 = 0;
      const row = costMatrix[i0 - 1]!;

      for (let j = 1; j <= m; j++) {
        if (!used[j]) {
          const cur = row[j - 1]! - u[i0]! - v[j]!;
          if (cur < minv[j]!) {
            minv[j] = cur;
            way[j] = j0;
          }
          if (minv[j]! < delta) {
            delta = minv[j]!;
            j1 = j;
          }
        }
      }

      for (let j = 0; j <= m; j++) {
        if (used[j]) {
          u[p[j]!] = u[p[j]!]! + delta;
          v[j] = v[j]! - delta;
        } else {
          minv[j] = minv[j]! - delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);

    do {
      const j1 = way[j0]!;
      p[j0] = p[j1]!;
      j0 = j1;
    } while (j0 !== 0);
  }

  const assignment = new Array<number>(n).fill(-1);
  for (let j = 1; j <= m; j++) {
    const rowIdx = p[j]!;
    if (rowIdx > 0) {
      assignment[rowIdx - 1] = j - 1;
    }
  }

  let totalCost = 0;
  for (let i = 0; i < n; i++) {
    const col = assignment[i]!;
    if (col < 0) {
      throw new Error(`Incomplete assignment at row ${i}.`);
    }
    totalCost += costMatrix[i]![col]!;
  }

  return { assignment, totalCost };
}
