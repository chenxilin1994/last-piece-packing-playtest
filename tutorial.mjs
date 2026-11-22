import { cargoIllustration } from './camping-art.mjs?v=gear-4';
import { boardSize, footprint, shape } from './packing.mjs?v=guide-6';
import { suggestMove } from './packing-assist.mjs?v=assist-7';

const preferenceKey = 'last-piece-board-guide-seen';

const steps = [
  { title: '先装一件', text: '把货物拖进亮框。也可以先选货物，再点亮框里的圆点。', action: 'place' },
  { title: '试试撤回', text: '按下方亮起的「撤回」，刚装的货物会回到货架。', action: 'undo' },
  { title: '转个方向', text: '选中货架上的货物，按下方「旋转」转 90°。', action: 'rotate' },
  { title: '放下后还能移动', text: '再拖一件进亮框。想换方向，先把已装的货物拖回货架。红纹表示放不下。', action: 'place' },
  { title: '卡住时用道具', text: '「提示」标出货物和落点。「自动摆放」帮你装好一件，也能撤回。', action: 'hint' },
  { title: '准备出发', text: '「重开」清空本关。右上角能调声音，上方「选关」能换关。货物装齐就关门。' },
];

export function createTutorial() {
  const box = document.getElementById('tutorial');
  const targets = document.getElementById('tutorial-targets');
  const progress = document.getElementById('tutorial-progress');
  const title = document.getElementById('tutorial-title');
  const text = document.getElementById('tutorial-text');
  const next = document.getElementById('tutorial-next');
  const skip = document.getElementById('tutorial-skip');
  const open = document.getElementById('tutorial-open');
  let firstLevel = false;
  let showing = true;
  let stepIndex = 0;
  let board;
  try { showing = localStorage.getItem(preferenceKey) !== '1'; } catch {}

  function guideTarget(step) {
    if (!board) return null;
    const { level, states, selected } = board;
    if (step.action === 'place') return suggestMove(level, states, selected);
    if (step.action === 'undo' && selected && states[selected].x !== null) {
      return { type: 'loaded', id: selected, placement: states[selected] };
    }
    if (step.action === 'rotate') {
      const piece = level.pieces.find(({ id }) => id === selected && states[id].x === null)
        ?? level.pieces.find(({ id }) => states[id].x === null);
      if (piece) return { type: 'shelf', id: piece.id };
    }
    return null;
  }

  function showTarget(target, step) {
    box.dataset.side = 'bottom';
    text.textContent = step.text;
    if (!target) return;

    const { level, states, unit } = board;
    const piece = level.pieces.find(({ id }) => id === target.id);
    document.querySelector(`#tray .tray-slot[data-piece="${target.id}"]`)?.classList.add('is-guided');

    if (target.type === 'shelf') {
      text.textContent = `选中亮起的「${piece.name}」，按「旋转」转 90°。`;
      return;
    }
    const placement = target.placement ?? states[target.id];
    const cells = footprint(piece, placement);
    const rows = cells.map(([, y]) => y);
    box.dataset.side = (Math.min(...rows) + Math.max(...rows) + 1) / 2 < boardSize(level).height / 2
      ? 'bottom' : 'top';

    if (target.type === 'place') {
      const ghost = document.createElement('span');
      const { width, height } = shape(piece.cells, placement.rotation);
      ghost.className = 'guide-ghost';
      Object.assign(ghost.style, {
        left: `${placement.x * unit}px`,
        top: `${placement.y * unit}px`,
        width: `${width * unit}px`,
        height: `${height * unit}px`,
      });
      ghost.append(cargoIllustration(piece, placement.rotation, unit));
      targets.append(ghost);
      const turns = (placement.rotation - states[target.id].rotation + 4) % 4;
      text.textContent = turns
        ? `把「${piece.name}」旋转 ${turns} 次，再拖进亮框。`
        : stepIndex === 0
          ? `拖「${piece.name}」进亮框，或点亮框里的圆点。`
          : `拖「${piece.name}」进亮框。想再转，就拖回货架。`;
    } else if (target.type === 'return') {
      text.textContent = `先把亮框标出的「${piece.name}」拖回货架，再试下一次摆放。`;
    }

    for (const [index, [x, y]] of cells.entries()) {
      const tile = document.createElement('span');
      tile.className = 'guide-cell';
      if (target.type === 'place' && index === 0) tile.classList.add('is-anchor');
      Object.assign(tile.style, {
        left: `${x * unit}px`, top: `${y * unit}px`, width: `${unit}px`, height: `${unit}px`,
      });
      targets.append(tile);
    }
  }

  function render() {
    const visible = firstLevel && showing;
    box.hidden = !visible;
    open.hidden = !firstLevel || visible;
    targets.replaceChildren();
    document.querySelector('#tray .is-guided')?.classList.remove('is-guided');
    if (!visible) {
      delete document.body.dataset.guideStep;
      return;
    }
    const step = steps[stepIndex];
    document.body.dataset.guideStep = step.action ?? 'finish';
    progress.textContent = `${stepIndex + 1} / ${steps.length}`;
    title.textContent = step.title;
    showTarget(guideTarget(step), step);
    next.textContent = stepIndex === steps.length - 1 ? '开始挑战' : '下一步';
    skip.hidden = stepIndex === steps.length - 1;
  }

  function dismiss() {
    const shouldRestoreFocus = box.contains(document.activeElement);
    showing = false;
    try { localStorage.setItem(preferenceKey, '1'); } catch {}
    render();
    if (shouldRestoreFocus) open.focus({ preventScroll: true });
  }

  function advanceStep() {
    if (stepIndex === steps.length - 1) {
      dismiss();
      return;
    }
    stepIndex += 1;
    render();
  }

  next.addEventListener('click', advanceStep);
  skip.addEventListener('click', dismiss);
  open.addEventListener('click', () => {
    showing = true;
    stepIndex = 0;
    render();
    next.focus({ preventScroll: true });
  });

  return {
    setLevel(levelIndex) {
      firstLevel = levelIndex === 0;
      render();
    },
    update(data) {
      board = data;
      if (firstLevel && showing) render();
    },
    advance(action) {
      if (firstLevel && showing && steps[stepIndex].action === action) advanceStep();
    },
  };
}
