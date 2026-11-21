import { shape } from './packing.mjs';

const equipment = {
  a: 'camp-lounger.webp',
  b: 'camp-snack-tray.webp',
  c: 'folding-camp-table.webp',
  d: 'camp-tool-roll.webp',
  e: 'hooked-camp-umbrella.webp',
};

export const campingArtFiles = Object.values(equipment);

export function cargoIllustration(piece, rotation, unit) {
  // Each unrotated sprite uses the same grid as the piece, including transparent gaps.
  const { width, height } = shape(piece.cells, 0);
  const image = document.createElement('img');
  image.className = 'cargo-art';
  image.src = new URL(`./assets/${equipment[piece.id]}`, import.meta.url);
  image.alt = '';
  image.draggable = false;
  Object.assign(image.style, {
    width: `${width * unit}px`,
    height: `${height * unit}px`,
    transform: `translate(-50%, -50%) rotate(${rotation * 90}deg)`,
  });
  return image;
}
