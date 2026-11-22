import { placementError } from './packing.mjs';

const PREFIX = 'last-piece-campaign-v1:';
const ACTIVE_KEY = `${PREFIX}active`;
const MAX_HISTORY = 256;
const MAX_SNAPSHOT_CHARS = 64 * 1024;

export function freshRound(level) {
  return {
    states: Object.fromEntries(level.pieces.map(({ id }) => [id, { x: null, y: null, rotation: 0 }])),
    selected: level.pieces[0]?.id ?? null,
    history: [],
  };
}

function browserStorage() {
  try { return globalThis.localStorage; }
  catch { return null; }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readPose(value) {
  if (!isRecord(value)) return null;
  const { x, y, rotation } = value;
  if (!Number.isInteger(rotation) || rotation < 0 || rotation > 3) return null;
  if (x === null && y === null) return { x, y, rotation };
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || x < 0 || y < 0) return null;
  return { x, y, rotation };
}

function readHistory(level, states, pieces, history) {
  if (!Array.isArray(history)) return [];
  const entries = history.slice(-MAX_HISTORY);
  const undoState = { ...states };
  // Each saved move must be legal in the board that Undo will actually restore.
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    const piece = pieces.get(entry?.id);
    const before = readPose(entry?.before);
    if (!piece || !before || (before.x !== null && placementError(level, undoState, piece, before))) return [];
    undoState[piece.id] = before;
    entries[index] = { id: piece.id, before };
  }
  return entries;
}

function readSuggestion(level, states, pieces, value) {
  if (!isRecord(value)) return null;
  const { id, type } = value;
  const piece = pieces.get(id);
  if (!piece) return null;
  if (type === 'return' && states[id].x !== null && Object.values(states).some(({ x }) => x === null)) {
    return { type, id };
  }
  if (type !== 'place' || states[id].x !== null) return null;
  const placement = readPose(value.placement);
  if (!placement || placement.x === null || placementError(level, states, piece, placement)) return null;
  return { type, id, placement };
}

function readSnapshot(level, raw) {
  if (typeof raw !== 'string' || raw.length > MAX_SNAPSHOT_CHARS) return null;
  let snapshot;
  try { snapshot = JSON.parse(raw); }
  catch { return null; }
  if (!isRecord(snapshot) || !isRecord(snapshot.round) || !isRecord(snapshot.round.states)) return null;

  const { round } = snapshot;
  const states = Object.fromEntries(level.pieces.map(({ id }) => [id, readPose(round.states[id])]));
  if (level.pieces.some(({ id }) => !states[id])) return null;
  if (level.pieces.some(piece => states[piece.id].x !== null && placementError(level, states, piece, states[piece.id]))) {
    return null;
  }

  const pieces = new Map(level.pieces.map(piece => [piece.id, piece]));
  const selected = pieces.has(round.selected) ? round.selected : level.pieces[0]?.id ?? null;
  const history = readHistory(level, states, pieces, round.history);
  const suggestion = readSuggestion(level, states, pieces, snapshot.suggestion);
  return { round: { states, selected, history }, suggestion };
}

export function createCampaignSave(levels, storage = browserStorage()) {
  const memory = new Map();
  const unsavedKeys = new Set();
  const roundKeys = levels.map((_, index) => `${PREFIX}round:${index}`);
  const completionKeys = levels.map((_, index) => `${PREFIX}cleared:${index}`);
  const completionKeySet = new Set(completionKeys);
  const validIndex = index => Number.isInteger(index) && index >= 0 && index < levels.length;

  function read(key) {
    if (storage && !unsavedKeys.has(key)) {
      try {
        const value = storage.getItem(key);
        if (value === null) memory.delete(key);
        else memory.set(key, value);
        return value;
      } catch {}
    }
    return memory.get(key) ?? null;
  }

  function write(key, value) {
    memory.set(key, value);
    try {
      storage?.setItem(key, value);
      unsavedKeys.delete(key);
    } catch {
      // A readable but full store must not replace a newer in-memory save.
      unsavedKeys.add(key);
    }
  }

  function getClearedCount() {
    let count = 0;
    while (count < levels.length && read(completionKeys[count]) === '1') count += 1;
    return count;
  }

  return {
    loadRound(index) {
      return validIndex(index) ? readSnapshot(levels[index], read(roundKeys[index])) : null;
    },
    saveRound(index, round, suggestion = null) {
      if (!validIndex(index) || !isRecord(round)) return;
      const { states, selected, history } = round;
      const lastMoves = Array.isArray(history) ? history.slice(-MAX_HISTORY) : [];
      try {
        const raw = JSON.stringify({ round: { states, selected, history: lastMoves }, suggestion });
        if (raw.length <= MAX_SNAPSHOT_CHARS) write(roundKeys[index], raw);
      } catch {}
    },
    getActiveLevel() {
      const active = read(ACTIVE_KEY);
      if (typeof active !== 'string' || active.length > String(levels.length).length || !/^(0|[1-9]\d*)$/.test(active)) return 0;
      const index = Number(active);
      return validIndex(index) ? index : 0;
    },
    saveActiveLevel(index) {
      if (validIndex(index)) write(ACTIVE_KEY, String(index));
    },
    getClearedCount,
    markCleared(index) {
      const count = getClearedCount();
      if (!validIndex(index) || index !== count) return count;
      write(completionKeys[index], '1');
      return getClearedCount();
    },
    isCompletionKey(key) {
      return typeof key === 'string' && completionKeySet.has(key);
    },
  };
}
