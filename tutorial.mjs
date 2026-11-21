const preferenceKey = 'last-piece-guide-seen';

const steps = [
  { title: '先装一件', text: '拖到绿格再松手。也可以选中货物，再点圆点要落的格。', action: 'place' },
  { title: '试试撤回', text: '按「撤回」，刚放的货物就会回到货架。', action: 'undo' },
  { title: '转个方向', text: '选中货架上的货物，按「旋转」转 90°。', action: 'rotate' },
  { title: '放下后怎么改', text: '装好后还能移动。想换方向，先把它拖回货架。红色斜纹表示放不下。', action: 'place' },
  { title: '重开和声音', text: '「重开」会清空本关。右上角「声音」能切换风格和调音量。', action: 'reset' },
  { title: '准备出发', text: '货物装齐就会关门。也可以用上方的数字切换关卡。' },
];

export function createTutorial() {
  const box = document.getElementById('tutorial');
  const progress = document.getElementById('tutorial-progress');
  const title = document.getElementById('tutorial-title');
  const text = document.getElementById('tutorial-text');
  const next = document.getElementById('tutorial-next');
  const skip = document.getElementById('tutorial-skip');
  const open = document.getElementById('tutorial-open');
  let firstLevel = false;
  let showing = true;
  let stepIndex = 0;
  try { showing = localStorage.getItem(preferenceKey) !== '1'; } catch {}

  function render() {
    const visible = firstLevel && showing;
    box.hidden = !visible;
    open.hidden = !firstLevel || visible;
    if (!visible) {
      delete document.body.dataset.guideStep;
      return;
    }
    const step = steps[stepIndex];
    document.body.dataset.guideStep = step.action ?? 'finish';
    progress.textContent = `${stepIndex + 1} / ${steps.length}`;
    title.textContent = step.title;
    text.textContent = step.text;
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
    advance(action) {
      if (firstLevel && showing && steps[stepIndex].action === action) advanceStep();
    },
  };
}
