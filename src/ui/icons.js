import { html } from './lib.js';

// Outline icons from Lucide (ISC licence).
const PATHS = {
  plane: () => html`<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.2-1.1.6L3 8l5 5-3 3-3-.9L3 17l4.5 1.5L9 23l1.9-2-.9-3 3-3 5 5c.4-.2.7-.6.6-1.1z" />`,
  train: () => html`<rect width="16" height="16" x="4" y="3" rx="2" /><path d="M4 11h16" /><path d="M12 3v8" /><path d="m8 19-2 3" /><path d="m18 22-2-3" /><path d="M8 15h.01" /><path d="M16 15h.01" />`,
  bus: () => html`<path d="M8 6v6" /><path d="M15 6v6" /><path d="M2 12h19.6" /><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3" /><circle cx="7" cy="18" r="2" /><path d="M9 18h5" /><circle cx="16" cy="18" r="2" />`,
  car: () => html`<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" /><circle cx="7" cy="17" r="2" /><path d="M9 17h6" /><circle cx="17" cy="17" r="2" />`,
  ferry: () => html`<path d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1 .6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" /><path d="M19.38 20A11.6 11.6 0 0 0 21 14l-9-4-9 4c0 2.9.940 5.34 2.81 7.76" /><path d="M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6" /><path d="M12 10v4" /><path d="M12 2v3" />`,
  pin: () => html`<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" />`,
  minus: () => html`<path d="M5 12h14" />`,
  close: () => html`<path d="M18 6 6 18" /><path d="m6 6 12 12" />`,
  play: () => html`<path d="m7 4 12 8-12 8z" />`,
  pause: () => html`<path d="M8 5v14" /><path d="M16 5v14" />`,
  frame: () => html`<path d="M4 9V5h4" /><path d="M20 9V5h-4" /><path d="M4 15v4h4" /><path d="M20 15v4h-4" /><circle cx="12" cy="12" r="2" />`,
  plus: () => html`<path d="M5 12h14" /><path d="M12 5v14" />`,
  check: () => html`<path d="M20 6 9 17l-5-5" />`,
  chevron: () => html`<path d="m6 9 6 6 6-6" />`,
  undo: () => html`<path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />`,
  redo: () => html`<path d="m15 14 5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />`,
  more: () => html`<circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" />`,
  alert: () => html`<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" />`,
};

const METHOD_ICONS = { flight: 'plane', train: 'train', bus: 'bus', car: 'car', ferry: 'ferry' };

export const segmentIcon = (segment) => (segment.type === 'city' ? 'pin' : (METHOD_ICONS[segment.method] ?? 'plane'));

export function Icon({ name, size = 18 }) {
  return html`
    <svg class="icon" width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      ${PATHS[name]?.()}
    </svg>
  `;
}
