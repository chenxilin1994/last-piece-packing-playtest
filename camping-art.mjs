import { shape } from './packing.mjs';

const equipment = {
  a: { file: 'camp-chair', x: 0.03, y: 0.38, width: 0.94, height: 1.60 },
  b: { file: 'snack-box', x: 0.03, y: 0.03, width: 1.94, height: 1.91 },
  c: { file: 'camp-rack', x: 0.68, y: 0.02, width: 1.65, height: 0.96 },
  d: { file: 'tool-bag', x: 0.04, y: 0.04, width: 1.92, height: 1.92 },
  e: { file: 'rain-umbrella', x: 0.67, y: 0.69, width: 1.66, height: 1.66, tilt: -40 },
};

function equipmentImage(id, className) {
  const image = document.createElement('img');
  image.className = className;
  image.src = new URL(`./assets/${equipment[id].file}.webp`, import.meta.url);
  image.alt = '';
  image.draggable = false;
  return image;
}

export function trayIllustration(id, rotation) {
  const image = equipmentImage(id, 'camp-tray-paint');
  image.style.transform = `rotate(${rotation * 90}deg)`;
  return image;
}

export function cargoIllustration(piece, rotation, unit, geometry) {
  const { x, y, width, height, tilt = 0 } = equipment[piece.id];
  const base = shape(piece.cells, 0);
  const clip = document.createElement('span');
  clip.className = 'cargo-art-clip';
  const cells = geometry.cells.map(([column, row]) => {
    const left = column * unit;
    const top = row * unit;
    return `M ${left} ${top} h ${unit} v ${unit} h ${-unit} Z`;
  });
  clip.style.clipPath = `path("${cells.join(' ')}")`;

  const plane = document.createElement('span');
  plane.className = 'cargo-art-plane';
  plane.style.width = `${base.width * unit}px`;
  plane.style.height = `${base.height * unit}px`;
  plane.style.transform = `translate(-50%, -50%) rotate(${rotation * 90}deg)`;

  const image = equipmentImage(piece.id, 'cargo-art');
  Object.assign(image.style, {
    left: `${x * unit}px`,
    top: `${y * unit}px`,
    width: `${width * unit}px`,
    height: `${height * unit}px`,
    transform: `rotate(${tilt}deg)`,
  });
  plane.append(image);
  clip.append(plane);
  return clip;
}
