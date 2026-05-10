/** Dense numeric helpers for small ridge systems (spec §6.3). */

/** X is n×p design matrix (rows = observations). Returns XᵀX (p×p) and Xᵀy (p). */
export function accumulateXtXy(X: number[][], y: number[]): { XtX: number[][]; Xty: number[] } {
  const n = X.length;
  const p = X[0]?.length ?? 0;
  const XtX: number[][] = Array.from({ length: p }, () => Array(p).fill(0));
  const Xty = Array(p).fill(0);

  for (let r = 0; r < n; r += 1) {
    const row = X[r]!;
    const yr = y[r]!;
    for (let i = 0; i < p; i += 1) {
      Xty[i] += row[i]! * yr;
      for (let j = 0; j < p; j += 1) {
        XtX[i]![j]! += row[i]! * row[j]!;
      }
    }
  }
  return { XtX, Xty };
}

export function addDiagonalInPlace(a: number[][], lambda: number): void {
  for (let i = 0; i < a.length; i += 1) {
    a[i]![i]! += lambda;
  }
}

/** Solve A x = b for square A using Gaussian elimination with partial pivoting. */
export function solveLinearSystem(a: number[][], b: number[]): number[] {
  const n = a.length;
  const M = a.map((row, i) => [...row, b[i]!]);

  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    let best = Math.abs(M[col]![col]!);
    for (let r = col + 1; r < n; r += 1) {
      const v = Math.abs(M[r]![col]!);
      if (v > best) {
        best = v;
        pivot = r;
      }
    }
    if (best < 1e-18) {
      throw new Error("Singular matrix in linear solve");
    }
    if (pivot !== col) {
      const tmp = M[col]!;
      M[col] = M[pivot]!;
      M[pivot] = tmp;
    }

    const piv = M[col]![col]!;
    for (let j = col; j <= n; j += 1) {
      M[col]![j]! /= piv;
    }

    for (let r = 0; r < n; r += 1) {
      if (r === col) {
        continue;
      }
      const f = M[r]![col]!;
      if (f === 0) {
        continue;
      }
      for (let j = col; j <= n; j += 1) {
        M[r]![j]! -= f * M[col]![j]!;
      }
    }
  }

  return M.map((row) => row[n]!);
}
