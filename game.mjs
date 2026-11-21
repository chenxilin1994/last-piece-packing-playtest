import { LEVELS } from './levels.mjs';
import { SIZE, placementError, shape } from './packing.mjs';

const element = (id) => document.getElementById(id);
const grid = element('grid');
const placed = element('placed');
const tray = element('tray');
const win = element('win');
const status = element('status');
const boardKeys = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

function freshRound(level) {
  return {
    states: Object.fromEntries(level.pieces.map(({ id }) => [id, { x: null, y: null, rotation: 0 }])),
    selected: level.pieces[0].id,
    history: [],
  };
}

const rounds = LEVELS.map(freshRound);
let levelIndex = 0;
let drag = null;
let cursor = { x: 0, y: 0 };
const current = () => rounds[levelIndex];
const level = () => LEVELS[levelIndex];
const pieceById = (id) => level().pieces.find((piece) => piece.id === id);
const cellSize = () => grid.getBoundingClientRect().width / SIZE;
const loadedCount = (round) => Object.values(round.states).filter(({ x }) => x !== null).length;

function make(tag, className = '') {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

function drawCrate(piece, rotation, unit, className = '') {
  const geometry = shape(piece.cells, rotation);
  const crate = make('div', `crate ${piece.color} ${className}`);
  crate.dataset.piece = piece.id;
  crate.dataset.rotation = rotation;
  crate.style.width = `${geometry.width * unit}px`;
  crate.style.height = `${geometry.height * unit}px`;
  const outline = new Set(geometry.cells.map(([x, y]) => `${x},${y}`));
  // Round only exposed corners so irregular pieces read as one object.
  for (const [x, y] of geometry.cells) {
    const tile = make('span', 'cargo-cell');
    tile.style.left = `${x * unit}px`;
    tile.style.top = `${y * unit}px`;
    tile.style.width = `${unit}px`;
    tile.style.height = `${unit}px`;
    const left = outline.has(`${x - 1},${y}`);
    const right = outline.has(`${x + 1},${y}`);
    const above = outline.has(`${x},${y - 1}`);
    const below = outline.has(`${x},${y + 1}`);
    const radius = `${Math.max(2, Math.min(9, unit * 0.16))}px`;
    tile.style.borderRadius = [!left && !above, !right && !above, !right && !below, !left && !below]
      .map((corner) => corner ? radius : '0').join(' ');
    crate.append(tile);
  }
  if (piece.door) crate.firstElementChild.classList.add('express');
  return crate;
}

function renderNav() {
  const container = element('level-nav');
  for (const [index, data] of LEVELS.entries()) {
    const button = make('button', 'level-tab');
    button.type = 'button';
    button.textContent = index + 1;
    button.setAttribute('aria-label', `第 ${index + 1} 关：${data.name}`);
    button.addEventListener('click', () => goTo(index));
    container.append(button);
  }
}

function renderBoard() {
  const cells = element('cells');
  cells.replaceChildren();
  grid.classList.toggle('has-door', level().doorRow);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const cell = make('span', 'cell');
      if (level().blocked.some(([bx, by]) => x === bx && y === by)) cell.classList.add('blocked');
      if (level().doorRow && y === SIZE - 1) cell.classList.add('door-cell');
      cells.append(cell);
    }
  }
}

function renderPieces() {
  const { states, selected } = current();
  const unit = cellSize();
  placed.replaceChildren();
  tray.replaceChildren();
  for (const piece of level().pieces) {
    const state = states[piece.id];
    const selectedHere = selected === piece.id;
    const onBoard = state.x !== null;
    const slot = make('button', `tray-slot${selectedHere ? ' is-selected' : ''}${onBoard ? ' is-placed' : ''}`);
    slot.type = 'button';
    slot.dataset.piece = piece.id;
    slot.setAttribute('aria-pressed', selectedHere);
    slot.setAttribute('aria-label', `${piece.name}${onBoard ? '，已装入' : ''}${piece.door ? '，先送的货' : ''}`);
    const preview = make('span', 'crate-preview');
    const miniature = drawCrate(piece, state.rotation, 11, 'miniature');
    preview.append(miniature);
    const name = make('span', 'piece-name');
    name.textContent = piece.name;
    slot.append(preview, name);
    tray.append(slot);

    if (onBoard) {
      const crate = drawCrate(piece, state.rotation, unit, selectedHere ? 'is-selected' : '');
      crate.dataset.x = state.x;
      crate.dataset.y = state.y;
      crate.style.left = `${state.x * unit}px`;
      crate.style.top = `${state.y * unit}px`;
      crate.setAttribute('aria-hidden', 'true');
      placed.append(crate);
    }
  }
  element('progress').textContent = `${loadedCount(current())} / ${level().pieces.length} 件已装`;
  element('undo').disabled = current().history.length === 0;
  element('rotate').disabled = !selected;
}

function renderCursor() {
  element('cells').querySelector('.keyboard-cursor')?.classList.remove('keyboard-cursor');
  element('cells').children[cursor.y * SIZE + cursor.x]?.classList.add('keyboard-cursor');
  grid.setAttribute('aria-label', `车厢，第 ${cursor.y + 1} 行第 ${cursor.x + 1} 列。方向键移动，回车放置。`);
}

function renderLevel() {
  element('level-title').textContent = level().name;
  element('objective').textContent = level().objective;
  element('instruction').textContent = level().instruction;
  [...element('level-nav').children].forEach((button, index) => {
    const active = index === levelIndex;
    button.classList.toggle('is-active', active);
    button.classList.toggle('is-complete', loadedCount(rounds[index]) === LEVELS[index].pieces.length);
    if (active) button.setAttribute('aria-current', 'step');
    else button.removeAttribute('aria-current');
  });
  renderBoard();
  renderPieces();
  renderCursor();
}

function goTo(index) {
  if (drag) releaseDrag();
  if (win.open) win.close();
  levelIndex = index;
  cursor = { x: 0, y: 0 };
  status.textContent = '';
  renderLevel();
  if (loadedCount(current()) === level().pieces.length) showWin();
}

function showWin() {
  const allClear = rounds.every((round, index) => loadedCount(round) === LEVELS[index].pieces.length);
  element('win-title').textContent = allClear ? '五关全部装好！' : '车门关上了！';
  element('win-text').textContent = allClear ? '最后一件也有了自己的位置。' : `第 ${levelIndex + 1} 关 · ${level().name}`;
  const order = [...LEVELS.keys()].map((_, offset) => (levelIndex + offset + 1) % LEVELS.length);
  const next = order.find((index) => loadedCount(rounds[index]) < LEVELS[index].pieces.length);
  const nextButton = element('next-level');
  nextButton.hidden = next === undefined;
  if (next !== undefined) {
    nextButton.textContent = next === levelIndex + 1 ? '下一关' : `去第 ${next + 1} 关`;
    nextButton.onclick = () => goTo(next);
  }
  element('level-nav').children[levelIndex].classList.add('is-complete');
  if (!win.open) win.showModal();
}

function select(id) {
  current().selected = id;
  status.textContent = '';
  renderPieces();
}

function commit(id, placement) {
  const round = current();
  const before = round.states[id];
  if (before.x === placement.x && before.y === placement.y && before.rotation === placement.rotation) {
    select(id);
    return;
  }
  const wasSolved = loadedCount(round) === level().pieces.length;
  round.history.push({ id, before });
  round.states[id] = placement;
  round.selected = id;
  status.textContent = '';
  renderPieces();
  const solved = loadedCount(round) === level().pieces.length;
  element('level-nav').children[levelIndex].classList.toggle('is-complete', solved);
  if (solved && !wasSolved) showWin();
}

function tryPlacement(piece, candidate) {
  const error = placementError(level(), current().states, piece, candidate);
  if (error) {
    status.textContent = error;
    return false;
  }
  commit(piece.id, candidate);
  return true;
}

function rotate() {
  const id = current().selected;
  if (!id || drag) return;
  const before = current().states[id];
  const placement = { ...before, rotation: (before.rotation + 1) % 4 };
  if (before.x === null) commit(id, placement);
  else tryPlacement(pieceById(id), placement);
}

function undo() {
  const round = current();
  if (drag || !round.history.length) return;
  const { id, before } = round.history.pop();
  round.states[id] = before;
  round.selected = id;
  status.textContent = '已撤回上一步。';
  renderPieces();
  element('level-nav').children[levelIndex].classList.toggle('is-complete', loadedCount(round) === level().pieces.length);
}

function restart() {
  if (drag) return;
  rounds[levelIndex] = freshRound(level());
  goTo(levelIndex);
}

function candidateAt(event, action) {
  const bounds = grid.getBoundingClientRect();
  const unit = bounds.width / SIZE;
  const inside = event.clientX >= bounds.left && event.clientX <= bounds.right
    && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
  if (!inside) return null;
  const x = Math.round((event.clientX - bounds.left) / unit - action.grabX);
  const y = Math.round((event.clientY - bounds.top) / unit - action.grabY);
  return { x, y, rotation: action.rotation };
}

function startDrag(event) {
  if (drag || !event.isPrimary || event.button !== 0) return;
  const source = event.target.closest('[data-piece]');
  if (!source) return;
  const id = source.dataset.piece;
  const piece = pieceById(id);
  if (!piece) return;
  const state = current().states[id];
  const onBoard = placed.contains(source);
  const geometry = shape(piece.cells, state.rotation);
  const rect = source.getBoundingClientRect();
  const fromMiniature = !onBoard && source.classList.contains('miniature');
  drag = {
    pointerId: event.pointerId,
    piece,
    rotation: state.rotation,
    onBoard,
    startX: event.clientX,
    startY: event.clientY,
    grabX: onBoard || fromMiniature ? (event.clientX - rect.left) / rect.width * geometry.width : geometry.width / 2,
    grabY: onBoard || fromMiniature ? (event.clientY - rect.top) / rect.height * geometry.height : geometry.height / 2,
    moved: false,
  };
  source.setPointerCapture(event.pointerId);
}

function moveDrag(event) {
  if (!drag || drag.pointerId !== event.pointerId) return;
  if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 6) return;
  const unit = cellSize();
  if (!drag.moved) {
    drag.moved = true;
    drag.floating = drawCrate(drag.piece, drag.rotation, unit, 'is-dragging');
    drag.floating.style.position = 'fixed';
    drag.floating.style.zIndex = '10';
    drag.floating.style.pointerEvents = 'none';
    document.body.append(drag.floating);
    if (drag.onBoard) {
      drag.original = placed.querySelector(`[data-piece="${drag.piece.id}"]`);
      drag.original?.classList.add('is-ghost');
    }
  }
  drag.floating.style.left = `${event.clientX - drag.grabX * unit}px`;
  drag.floating.style.top = `${event.clientY - drag.grabY * unit}px`;
  drag.preview?.remove();
  const candidate = candidateAt(event, drag);
  if (!candidate) return;
  const error = placementError(level(), current().states, drag.piece, candidate);
  drag.preview = drawCrate(drag.piece, drag.rotation, unit, `preview${error ? ' is-invalid' : ''}`);
  drag.preview.style.left = `${candidate.x * unit}px`;
  drag.preview.style.top = `${candidate.y * unit}px`;
  placed.append(drag.preview);
}

function releaseDrag() {
  const action = drag;
  drag = null;
  action.floating?.remove();
  action.preview?.remove();
  action.original?.classList.remove('is-ghost');
  return action;
}

function finishDrag(event) {
  if (!drag || drag.pointerId !== event.pointerId) return;
  const action = releaseDrag();
  if (event.type === 'pointercancel' || event.type === 'lostpointercapture') return;
  if (!action.moved) {
    select(action.piece.id);
    return;
  }
  const candidate = candidateAt(event, action);
  if (candidate) {
    tryPlacement(action.piece, candidate);
    return;
  }
  const shelf = tray.getBoundingClientRect();
  if (action.onBoard && event.clientX >= shelf.left && event.clientX <= shelf.right
      && event.clientY >= shelf.top && event.clientY <= shelf.bottom) {
    commit(action.piece.id, { x: null, y: null, rotation: action.rotation });
  }
}

function placeAt(x, y) {
  const id = current().selected;
  if (!id) return;
  const piece = pieceById(id);
  const { rotation } = current().states[id];
  const [[anchorX, anchorY]] = shape(piece.cells, rotation).cells;
  tryPlacement(piece, { x: x - anchorX, y: y - anchorY, rotation });
}

tray.addEventListener('pointerdown', startDrag);
placed.addEventListener('pointerdown', startDrag);
window.addEventListener('pointermove', moveDrag);
window.addEventListener('pointerup', finishDrag);
window.addEventListener('pointercancel', finishDrag);
document.addEventListener('lostpointercapture', finishDrag);

tray.addEventListener('click', (event) => {
  const slot = event.target.closest('.tray-slot');
  if (slot && event.detail === 0) {
    select(slot.dataset.piece);
    tray.querySelector(`[data-piece="${slot.dataset.piece}"]`)?.focus();
  }
});

grid.addEventListener('click', (event) => {
  if (event.target.closest('[data-piece]') || event.detail === 0) return;
  const bounds = grid.getBoundingClientRect();
  const unit = bounds.width / SIZE;
  placeAt(Math.floor((event.clientX - bounds.left) / unit), Math.floor((event.clientY - bounds.top) / unit));
});

grid.addEventListener('keydown', (event) => {
  const direction = boardKeys[event.key];
  if (direction) {
    event.preventDefault();
    cursor.x = Math.min(SIZE - 1, Math.max(0, cursor.x + direction[0]));
    cursor.y = Math.min(SIZE - 1, Math.max(0, cursor.y + direction[1]));
    renderCursor();
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    placeAt(cursor.x, cursor.y);
  }
});

grid.tabIndex = 0;
element('rotate').addEventListener('click', rotate);
element('undo').addEventListener('click', undo);
element('restart').addEventListener('click', restart);
element('replay').addEventListener('click', restart);
new ResizeObserver(() => {
  if (!drag) renderPieces();
}).observe(grid);

renderNav();
renderLevel();
