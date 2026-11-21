import { boardSize, placementError, shape } from './packing.mjs';

function placementOptions(level) {
  const { width, height } = boardSize(level);
  const empty = Object.fromEntries(level.pieces.map(({ id }) => [id, { x: null, y: null, rotation: 0 }]));
  const cellBits = Array.from({ length: width * height }, (_, index) => 1n << BigInt(index));

  return level.pieces.map((piece, index) => {
    const orientations = new Map();
    for (let rotation = 0; rotation < 4; rotation += 1) {
      const geometry = shape(piece.cells, rotation);
      const key = geometry.cells.join(';');
      if (!orientations.has(key)) orientations.set(key, { geometry, rotations: [] });
      orientations.get(key).rotations.push(rotation);
    }

    const choices = [];
    for (const { geometry, rotations } of orientations.values()) {
      for (let y = 0; y <= height - geometry.height; y += 1) {
        for (let x = 0; x <= width - geometry.width; x += 1) {
          if (placementError(level, empty, piece, { x, y, rotation: rotations[0] })) continue;
          let mask = 0n;
          for (const [dx, dy] of geometry.cells) mask |= cellBits[(y + dy) * width + x + dx];
          choices.push({ x, y, rotations, mask });
        }
      }
    }
    return { id: piece.id, bit: 1n << BigInt(index), choices };
  });
}

function completionSearch(pieces) {
  const failures = new Map();

  return function canFinish(remaining, occupied) {
    if (remaining === 0n) return true;
    if (!failures.has(remaining)) failures.set(remaining, new Set());
    const failedBoards = failures.get(remaining);
    if (failedBoards.has(occupied)) return false;

    // Branch on the piece with the fewest placements left on this board.
    let best;
    let bestChoices;
    for (const piece of pieces) {
      if ((remaining & piece.bit) === 0n) continue;
      const choices = piece.choices.filter(({ mask }) => (mask & occupied) === 0n);
      if (!bestChoices || choices.length < bestChoices.length) {
        best = piece;
        bestChoices = choices;
      }
      if (choices.length === 0) break;
    }
    for (const { mask } of bestChoices) {
      if (canFinish(remaining ^ best.bit, occupied | mask)) return true;
    }
    failedBoards.add(occupied);
    return false;
  };
}

export function suggestMove(level, states, preferredId) {
  const shelved = level.pieces.filter(({ id }) => states[id]?.x == null);
  if (shelved.length === 0) return null;
  const targetId = shelved.find(({ id }) => id === preferredId)?.id ?? shelved[0].id;
  const targetRotation = states[targetId]?.rotation ?? 0;
  const pieces = placementOptions(level);
  const target = pieces.find(({ id }) => id === targetId);
  const allPieces = pieces.reduce((bits, { bit }) => bits | bit, 0n);
  const anchors = pieces.flatMap(({ id, bit, choices }) => {
    const state = states[id];
    if (state?.x == null) return [];
    const option = choices.find(({ x, y, rotations }) => (
      x === state.x && y === state.y && rotations.includes(state.rotation)
    ));
    return [{ id, bit, option }];
  });
  const canFinish = completionSearch(pieces);

  function boardAfterReturns(returned) {
    let remaining = allPieces;
    let occupied = 0n;
    for (const { bit, option } of anchors) {
      if ((returned & bit) !== 0n) continue;
      if (!option || (option.mask & occupied) !== 0n) return null;
      remaining ^= bit;
      occupied |= option.mask;
    }
    return { remaining, occupied };
  }

  const board = boardAfterReturns(0n);
  if (board) {
    const fits = target.choices.filter(({ mask }) => (mask & board.occupied) === 0n);
    const sameRotation = fits.filter(({ rotations }) => rotations.includes(targetRotation));
    const turned = fits.filter(({ rotations }) => !rotations.includes(targetRotation));
    for (const option of [...sameRotation, ...turned]) {
      if (!canFinish(board.remaining ^ target.bit, board.occupied | option.mask)) continue;
      const { x, y, rotations } = option;
      const rotation = rotations.includes(targetRotation) ? targetRotation : rotations[0];
      return { type: 'place', id: targetId, placement: { x, y, rotation } };
    }
  }

  function findReturns(count, start, returned, firstId) {
    if (count === 0) {
      const candidate = boardAfterReturns(returned);
      return candidate && canFinish(candidate.remaining, candidate.occupied) ? firstId : null;
    }
    for (let index = start; index <= anchors.length - count; index += 1) {
      const { id, bit } = anchors[index];
      const result = findReturns(count - 1, index + 1, returned | bit, firstId ?? id);
      if (result !== null) return result;
    }
    return null;
  }

  // Try returning one item before two, and so on, to keep as much of the loaded cargo as possible.
  for (let count = 1; count <= anchors.length; count += 1) {
    const id = findReturns(count, 0, 0n, null);
    if (id !== null) return { type: 'return', id };
  }
  return null;
}
