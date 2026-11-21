import { shape } from './packing.mjs';

const equipment = {
  a: { file: 'camp-chair', x: 0.5, y: 1.44, width: 0.92, height: 1.14 },
  b: { file: 'snack-box', x: 1, y: 1, width: 1.9, height: 1.6 },
  c: { file: 'camp-rack', x: 1.5, y: 0.5, width: 0.88, height: 0.95 },
  d: { file: 'tool-bag', x: 1, y: 1, width: 1.83, height: 1.90 },
  e: { file: 'rain-umbrella', x: 1.18, y: 2.13, width: 1.59, height: 1.68 },
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

export function cargoArtCenter(piece, rotation, geometry) {
  const { x, y } = equipment[piece.id];
  const base = shape(piece.cells, 0);
  const angle = rotation * Math.PI / 2;
  const horizontal = x - base.width / 2;
  const vertical = y - base.height / 2;
  return {
    x: geometry.width / 2 + horizontal * Math.cos(angle) - vertical * Math.sin(angle),
    y: geometry.height / 2 + horizontal * Math.sin(angle) + vertical * Math.cos(angle),
  };
}

export function cargoIllustration(piece, rotation, unit, geometry) {
  const { width, height } = equipment[piece.id];
  const center = cargoArtCenter(piece, rotation, geometry);
  const image = equipmentImage(piece.id, 'cargo-art');
  Object.assign(image.style, {
    left: `${center.x * unit}px`,
    top: `${center.y * unit}px`,
    width: `${width * unit}px`,
    height: `${height * unit}px`,
    transform: `translate(-50%, -50%) rotate(${rotation * 90}deg)`,
  });
  return image;
}
