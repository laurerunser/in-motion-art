import { works } from './art/index.js';
import {
  ARTIST_NAME,
  PAGE_TITLE,
  DISCIPLINES,
  INTRO_EYEBROW,
  INTRO_HEADING,
  INTRO_HEADING_EM,
  INTRO_TAG,
  FOOTER_TEXT,
} from './copy.js';

document.title = PAGE_TITLE;
document.querySelector('.topbar .name').innerHTML =
  `${ARTIST_NAME}<small>${DISCIPLINES}</small>`;
document.querySelector('.intro .eyebrow').textContent = INTRO_EYEBROW;
document.querySelector('.intro h1').innerHTML =
  `${INTRO_HEADING} <em>${INTRO_HEADING_EM}</em>`;
document.querySelector('.intro .tag').textContent = INTRO_TAG;
document.querySelector('footer').textContent = FOOTER_TEXT;

const N = works.length;
document.getElementById('introCount').textContent = `— ${numberWord(N)} works —`;

const grid = document.getElementById('grid');
works.forEach((w, i) => {
  const el = document.createElement('div');
  el.className = 'work';
  el.innerHTML =
    '<div class="frame">' +
      '<canvas aria-hidden="true"></canvas>' +
      '<span class="no">№ ' + String(i + 1).padStart(2, '0') + ' / ' + N + '</span>' +
      '<span class="phen">' + w.phenomenon + '</span>' +
    '</div>' +
    '<div class="cap"><h2>' + w.title + '</h2></div>';
  grid.appendChild(el);

  const canvas = el.querySelector('canvas');
  const field = window.ArtField.create(canvas, { mode: w.mode, seed: i + 7 });
  window.ArtField.observe(field);
  el.addEventListener('pointerenter', () => field.setHot(true));
  el.addEventListener('pointerleave', () => field.setHot(false));
  el.addEventListener('focus',        () => field.setHot(true));
  el.addEventListener('blur',         () => field.setHot(false));
});

function numberWord(n) {
  const words = ['zero','one','two','three','four','five','six','seven','eight',
                 'nine','ten','eleven','twelve','thirteen','fourteen','fifteen'];
  return words[n] ?? n;
}
