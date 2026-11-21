export const SIZE = 5;

export function shape(cells, rotation) {
  let points = cells;
  for (let turn = 0; turn < rotation; turn += 1) {
    const bottom = Math.max(...points.map(([, y]) => y));
    points = points.map(([x, y]) => [bottom - y, x]);
  }
  return {
    cells: [...points].sort(([ax, ay], [bx, by]) => ay - by || ax - bx),
    width: Math.max(...points.map(([x]) => x)) + 1,
    height: Math.max(...points.map(([, y]) => y)) + 1,
  };
}

export function footprint(piece, state) {
  return shape(piece.cells, state.rotation).cells.map(([x, y]) => [x + state.x, y + state.y]);
}

export function placementError(level, states, piece, candidate) {
  const cells = footprint(piece, candidate);
  if (cells.some(([x, y]) => x < 0 || y < 0 || x >= SIZE || y >= SIZE)) {
    return '货物要全部放进车厢。';
  }
  const occupied = level.pieces.flatMap((other) => {
    const placement = states[other.id];
    return other.id !== piece.id && placement.x !== null ? footprint(other, placement) : [];
  });
  const forbidden = new Set([...level.blocked, ...occupied].map(([x, y]) => `${x},${y}`));
  if (cells.some(([x, y]) => forbidden.has(`${x},${y}`))) {
    return '这里被占了，换个位置试试。';
  }
  if (piece.door && !cells.some(([, y]) => y === SIZE - 1)) {
    return '先送的货至少要有一格贴着底部车门。';
  }
  return '';
}
