import { cargoIllustration } from './camping-art.mjs?v=gear-4';
import { createGameAudio } from './camping-audio.mjs?v=settings-6';
import { LEVELS } from './levels.mjs?v=guide-6';
import { boardSize, placementError, shape } from './packing.mjs?v=guide-6';
import { createTutorial } from './tutorial.mjs?v=guide-6';

const element = (id) => document.getElementById(id);
const grid = element('grid');
const placed = element('placed');
const tray = element('tray');
const win = element('win');
const status = element('status');
const campHatch = element('camp-hatch');
const gameAudio = createGameAudio(element('camp-sound'));
const tutorial = createTutorial();
const CAMPING_LEVEL = 2;
const boardKeys = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

function freshRound(level) {
  return {
    states: Object.fromEntries(level.pieces.map(({ id }) => [id, { x: null, y: null, rotation: 0 }])),
    selected: level.pieces[0].id,
    history: [],
  };
}

const rounds = LEVELS.map(freshRound);
const requestedLevel = Number(new URLSearchParams(location.search).get('level'));
let levelIndex = Number.isInteger(requestedLevel) && requestedLevel >= 1 && requestedLevel <= LEVELS.length
  ? requestedLevel - 1 : 0;
let drag = null;
let tapPreview = null;
let winTimer = null;
let cursor = { x: 0, y: 0 };
const isCamping = () => levelIndex === CAMPING_LEVEL;
const current = () => rounds[levelIndex];
const level = () => LEVELS[levelIndex];
const pieceById = (id) => level().pieces.find((piece) => piece.id === id);
const cellSize = () => grid.getBoundingClientRect().width / boardSize(level()).width;
const loadedCount = (round) => Object.values(round.states).filter(({ x }) => x !== null).length;

function make(tag, className = '') {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

function setStatus(message = '', tone = '') {
  status.textContent = message;
  status.dataset.tone = tone;
}

function priorityTag() {
  const tag = make('span', 'priority-tag');
  tag.textContent = '先取';
  tag.setAttribute('aria-hidden', 'true');
  return tag;
}

function drawCrate(piece, rotation, unit, className = '') {
  const geometry = shape(piece.cells, rotation);
  const crate = make('div', `crate ${className}`);
  const preview = crate.classList.contains('preview');
  const miniature = crate.classList.contains('miniature');
  const floating = crate.classList.contains('is-dragging');
  crate.dataset.piece = piece.id;
  crate.dataset.rotation = rotation;
  crate.style.width = `${geometry.width * unit}px`;
  crate.style.height = `${geometry.height * unit}px`;
  if (!miniature && !floating) {
    // Settled hit regions and landing previews both use the original occupied cells.
    for (const [x, y] of geometry.cells) {
      const tile = make('span', 'cargo-cell');
      tile.style.left = `${x * unit}px`;
      tile.style.top = `${y * unit}px`;
      tile.style.width = `${unit}px`;
      tile.style.height = `${unit}px`;
      crate.append(tile);
    }
  }
  if (!preview) crate.append(cargoIllustration(piece, rotation, unit));
  const [[x, y]] = geometry.cells;
  if (crate.classList.contains('is-selected') || preview) {
    const anchor = make('span', 'drop-anchor');
    anchor.style.left = `${(x + 0.5) * unit}px`;
    anchor.style.top = `${(y + 0.5) * unit}px`;
    crate.append(anchor);
  }
  if (piece.door && !preview && !miniature) {
    const tag = priorityTag();
    tag.style.left = `${(x + 0.5) * unit}px`;
    tag.style.top = `${(y + 0.69) * unit}px`;
    crate.append(tag);
  }
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
  const data = level();
  const { width, height } = boardSize(data);
  cells.replaceChildren();
  grid.style.setProperty('--board-columns', width);
  grid.style.setProperty('--board-rows', height);
  grid.classList.toggle('has-door', data.doorRow);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const cell = make('span', 'cell');
      if (data.blocked.some(([bx, by]) => x === bx && y === by)) cell.classList.add('blocked');
      if (x === width - 1) cell.classList.add('last-column');
      if (y === height - 1) {
        cell.classList.add('last-row');
        if (data.doorRow) cell.classList.add('door-cell');
      }
      cells.append(cell);
    }
  }
}

function renderPieces() {
  const { states, selected } = current();
  const unit = cellSize();
  const pieces = level().pieces;
  const longestPiece = Math.max(...pieces.map(({ cells }) => {
    const { width, height } = shape(cells, 0);
    return Math.max(width, height);
  }));
  const thumbnailUnit = Number.parseFloat(getComputedStyle(tray).getPropertyValue('--thumbnail-cell'))
    * Math.min(1, 3 / longestPiece);
  tapPreview = null;
  placed.replaceChildren();
  tray.replaceChildren();
  for (const piece of pieces) {
    const state = states[piece.id];
    const selectedHere = selected === piece.id;
    const onBoard = state.x !== null;
    const slot = make('button', `tray-slot${selectedHere ? ' is-selected' : ''}${onBoard ? ' is-placed' : ''}`);
    slot.type = 'button';
    slot.dataset.piece = piece.id;
    slot.setAttribute('aria-pressed', selectedHere);
    slot.setAttribute('aria-label', `${piece.name}${onBoard ? '，已装入' : ''}${piece.door ? '，先取的货' : ''}`);
    const preview = make('span', 'crate-preview');
    const miniature = drawCrate(piece, state.rotation, thumbnailUnit,
      selectedHere ? 'miniature is-selected' : 'miniature');
    preview.append(miniature);
    const name = make('span', 'piece-name');
    name.textContent = piece.name;
    slot.append(preview, name);
    if (piece.door) slot.append(priorityTag());
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
  element('progress').textContent = `${loadedCount(current())} / ${pieces.length} 件已装`;
  element('undo').disabled = current().history.length === 0;
  const selectedOnBoard = selected && states[selected].x !== null;
  const rotateButton = element('rotate');
  rotateButton.disabled = !selected || selectedOnBoard;
  element('rotation-help').hidden = !selectedOnBoard;
  if (selectedOnBoard) rotateButton.setAttribute('aria-describedby', 'rotation-help');
  else rotateButton.removeAttribute('aria-describedby');
}

function renderCursor() {
  const data = level();
  const { width, height } = boardSize(data);
  element('cells').querySelector('.keyboard-cursor')?.classList.remove('keyboard-cursor');
  element('cells').children[cursor.y * width + cursor.x]?.classList.add('keyboard-cursor');
  grid.setAttribute('aria-label', `${data.vehicle || '后备厢'}，${height} 行 ${width} 列。当前位置第 ${cursor.y + 1} 行第 ${cursor.x + 1} 列。方向键移动，回车放置。`);
}

function renderLevel() {
  const data = level();
  const { width, height } = boardSize(data);
  document.body.classList.toggle('is-camping', isCamping());
  document.body.dataset.theme = data.theme || '';
  element('level-title').textContent = data.name;
  element('vehicle-label').textContent = data.vehicle || '后备厢';
  element('board-size').textContent = `${width} × ${height}`;
  const difficulty = element('difficulty');
  difficulty.hidden = !data.difficulty;
  difficulty.textContent = data.difficulty || '';
  element('objective').textContent = data.objective;
  element('instruction').textContent = data.instruction;
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
  tutorial.setLevel(levelIndex);
}

function goTo(index) {
  if (drag) releaseDrag();
  clearTimeout(winTimer);
  winTimer = null;
  document.body.classList.remove('is-closing');
  if (win.open) win.close();
  levelIndex = index;
  cursor = { x: 0, y: 0 };
  setStatus();
  renderLevel();
  if (loadedCount(current()) === level().pieces.length) showWin();
}

function finishClosing() {
  if (winTimer === null) return;
  clearTimeout(winTimer);
  winTimer = null;
  gameAudio.play('win');
  showWin();
}

function completeRound() {
  document.body.classList.add('is-closing');
  gameAudio.play('hatch');
  winTimer = setTimeout(finishClosing, 700);
}

function showWin() {
  const allClear = rounds.every((round, index) => loadedCount(round) === LEVELS[index].pieces.length);
  element('win-title').textContent = allClear ? `${LEVELS.length} 关全部装好！` : '车门关上了！';
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
  setStatus();
  renderPieces();
}

function commit(id, placement, effect = 'place') {
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
  setStatus();
  renderPieces();
  gameAudio.play(effect);
  if (effect === 'rotate') tutorial.advance('rotate');
  if (before.x === null && placement.x !== null) tutorial.advance('place');
  const solved = loadedCount(round) === level().pieces.length;
  element('level-nav').children[levelIndex].classList.toggle('is-complete', solved);
  if (solved && !wasSolved) completeRound();
}

function tryPlacement(piece, candidate, effect) {
  const error = placementError(level(), current().states, piece, candidate);
  if (error) {
    setStatus(error, 'error');
    gameAudio.play('reject');
    return false;
  }
  commit(piece.id, candidate, effect);
  return true;
}

function rotate() {
  const id = current().selected;
  if (!id || drag || winTimer !== null) return;
  const before = current().states[id];
  if (before.x !== null) return;
  const placement = { ...before, rotation: (before.rotation + 1) % 4 };
  commit(id, placement, 'rotate');
}

function undo() {
  const round = current();
  if (drag || winTimer !== null || !round.history.length) return;
  const { id, before } = round.history.pop();
  round.states[id] = before;
  round.selected = id;
  setStatus('已撤回上一步。');
  gameAudio.play('undo');
  renderPieces();
  tutorial.advance('undo');
  element('level-nav').children[levelIndex].classList.toggle('is-complete', loadedCount(round) === level().pieces.length);
}

function restart() {
  if (drag) return;
  gameAudio.play('reset');
  rounds[levelIndex] = freshRound(level());
  goTo(levelIndex);
  tutorial.advance('reset');
}

function candidateAt(event, action) {
  const bounds = grid.getBoundingClientRect();
  const { width, height } = boardSize(level());
  const inside = event.clientX >= bounds.left && event.clientX <= bounds.right
    && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
  if (!inside) return null;
  const x = Math.round((event.clientX - bounds.left) / bounds.width * width - action.grabX);
  const y = Math.round((event.clientY - bounds.top) / bounds.height * height - action.grabY);
  return { x, y, rotation: action.rotation };
}

function startDrag(event) {
  if (drag || winTimer !== null || !event.isPrimary || event.button !== 0) return;
  const source = event.target.closest('[data-piece]');
  if (!source) return;
  const id = source.dataset.piece;
  const piece = pieceById(id);
  if (!piece) return;
  clearTapPreview();
  gameAudio.play('pick');
  const state = current().states[id];
  const onBoard = placed.contains(source);
  const geometry = shape(piece.cells, state.rotation);
  const miniature = source.querySelector('.miniature');
  const bounds = (miniature ?? source).getBoundingClientRect();
  const fromMiniature = event.clientX >= bounds.left && event.clientX <= bounds.right
    && event.clientY >= bounds.top && event.clientY <= bounds.bottom
    && (miniature !== null || source.classList.contains('miniature'));
  let grab = { x: geometry.width / 2, y: geometry.height / 2 };
  if (onBoard || fromMiniature) {
    grab = {
      x: (event.clientX - bounds.left) / bounds.width * geometry.width,
      y: (event.clientY - bounds.top) / bounds.height * geometry.height,
    };
  }
  drag = {
    pointerId: event.pointerId,
    piece,
    rotation: state.rotation,
    onBoard,
    startX: event.clientX,
    startY: event.clientY,
    grabX: grab.x,
    grabY: grab.y,
    moved: false,
  };
  source.setPointerCapture(event.pointerId);
}

function drawDropPreview(piece, candidate, unit) {
  const error = placementError(level(), current().states, piece, candidate);
  const preview = drawCrate(piece, candidate.rotation, unit, `preview${error ? ' is-invalid' : ''}`);
  preview.style.left = `${candidate.x * unit}px`;
  preview.style.top = `${candidate.y * unit}px`;
  preview.setAttribute('aria-hidden', 'true');
  placed.append(preview);
  return preview;
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
  if (candidate) drag.preview = drawDropPreview(drag.piece, candidate, unit);
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

function tapCandidate(x, y) {
  const id = current().selected;
  if (!id || winTimer !== null) return null;
  const piece = pieceById(id);
  const { rotation } = current().states[id];
  const [[anchorX, anchorY]] = shape(piece.cells, rotation).cells;
  return { piece, candidate: { x: x - anchorX, y: y - anchorY, rotation } };
}

function clearTapPreview() {
  tapPreview?.remove();
  tapPreview = null;
}

function placeAt(x, y) {
  const target = tapCandidate(x, y);
  if (target) tryPlacement(target.piece, target.candidate);
}

function gridPoint(event) {
  const bounds = grid.getBoundingClientRect();
  const { width, height } = boardSize(level());
  return [
    Math.floor((event.clientX - bounds.left) / bounds.width * width),
    Math.floor((event.clientY - bounds.top) / bounds.height * height),
  ];
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
    gameAudio.play('pick');
    select(slot.dataset.piece);
    tray.querySelector(`[data-piece="${slot.dataset.piece}"]`)?.focus();
  }
});

grid.addEventListener('pointerdown', (event) => {
  if (drag || !event.isPrimary || event.button !== 0
      || event.target.closest('[data-piece]')) return;
  clearTapPreview();
  const target = tapCandidate(...gridPoint(event));
  if (target) tapPreview = drawDropPreview(target.piece, target.candidate, cellSize());
});
grid.addEventListener('pointercancel', clearTapPreview);
grid.addEventListener('click', (event) => {
  if (event.target.closest('[data-piece]') || event.detail === 0) return;
  placeAt(...gridPoint(event));
});

grid.addEventListener('keydown', (event) => {
  const direction = boardKeys[event.key];
  if (direction) {
    event.preventDefault();
    const { width, height } = boardSize(level());
    cursor.x = Math.min(width - 1, Math.max(0, cursor.x + direction[0]));
    cursor.y = Math.min(height - 1, Math.max(0, cursor.y + direction[1]));
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
campHatch.addEventListener('animationend', finishClosing);
win.addEventListener('close', () => document.body.classList.remove('is-closing'));
const resize = new ResizeObserver(() => {
  if (!drag) renderPieces();
});
resize.observe(grid);
resize.observe(tray);

renderNav();
renderLevel();
