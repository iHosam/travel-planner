// All animation lives here, so views ask for an effect by name and never touch GSAP or Lenis.
// With "reduce motion" switched on every helper does nothing and the page scrolls natively.
//
//   GSAP 3.15 (core, Flip, ScrollTrigger, SplitText)  https://gsap.com  (standard no-charge licence)
//   Lenis 1.3.26                                      https://lenis.dev (MIT)
// Count-up, blur-in text and spotlight cards are reimplementations of ideas from React Bits
// (https://reactbits.dev); no React Bits code is copied.

import Lenis from '../../vendor/lenis.mjs';

// GSAP ships as classic scripts (its UMD wrapper cannot run in a strict ES module), so index.html
// loads them with `defer`; they always run before this module.

const { gsap, Flip, ScrollTrigger, SplitText } = window;
gsap.registerPlugin(Flip, ScrollTrigger, SplitText);

const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
export const reduced = () => reducedQuery.matches;

const EASE = 'power3.out';
const counters = new WeakMap();

// --- Smooth scrolling ---

let lenis = null;

export function startSmoothScroll() {
  if (lenis || reduced()) return;
  // Lenis drives ScrollTrigger, and GSAP's ticker drives Lenis, so both share one frame loop.
  lenis = new Lenis({ lerp: 0.12, wheelMultiplier: 0.9, autoRaf: false });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis?.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
  reducedQuery.addEventListener('change', () => {
    if (!reduced()) return;
    lenis?.destroy();
    lenis = null;
  });
}

// Freezes page scrolling while a sheet is open (the sheet itself still scrolls).
export function holdScroll(held) {
  if (held) lenis?.stop();
  else lenis?.start();
}

// --- Things moving to a new place (an activity changing day, a booking being approved) ---

let captured = null;

// Call just before a change that moves things; the next `playLayout` animates from here.
export function captureLayout(root = document) {
  if (reduced()) return;
  const targets = root.querySelectorAll('[data-flip-id]');
  captured = targets.length ? Flip.getState(targets) : null;
}

export function playLayout(root = document) {
  if (!captured) return;
  const state = captured;
  captured = null;
  Flip.from(state, {
    targets: root.querySelectorAll('[data-flip-id]'),
    duration: 0.5,
    ease: EASE,
    absolute: false,
    nested: true,
    prune: true,
  });
}

// --- Entrances ---

// A view appearing: a short rise and fade.
export function enterView(element) {
  if (!element || reduced()) return;
  gsap.fromTo(element, { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.45, ease: EASE, clearProps: 'all' });
}

// A floating panel appearing from its corner.
export function popIn(element) {
  if (!element || reduced()) return;
  gsap.fromTo(
    element,
    { autoAlpha: 0, scale: 0.92, y: 16, transformOrigin: '100% 100%' },
    { autoAlpha: 1, scale: 1, y: 0, duration: 0.5, ease: 'back.out(1.6)', clearProps: 'all' },
  );
}

// A nudge that asks for attention without moving anything else.
export function pulse(element) {
  if (!element || reduced()) return;
  gsap.fromTo(element, { scale: 1 }, { scale: 1.06, duration: 0.18, yoyo: true, repeat: 3, ease: 'sine.inOut', clearProps: 'transform' });
}

// Words of a heading sharpening into place, one after another.
export function blurIn(element) {
  if (!element || reduced()) return () => {};
  const split = SplitText.create(element, { type: 'words', wordsClass: 'split-word' });
  const tween = gsap.from(split.words, {
    autoAlpha: 0,
    y: 14,
    filter: 'blur(8px)',
    duration: 0.7,
    ease: EASE,
    stagger: 0.06,
    onComplete: () => split.revert(),
  });
  return () => {
    tween.kill();
    split.revert();
  };
}

// Cards rising into view as the page scrolls past them, once each.
export function revealOnScroll(elements) {
  if (!elements.length || reduced()) return () => {};
  gsap.set(elements, { autoAlpha: 0, y: 24 });
  const triggers = ScrollTrigger.batch(elements, {
    start: 'top bottom', // as soon as any of the card shows, so no blank sliver is left at the edge
    once: true,
    onEnter: (batch) => gsap.to(batch, { autoAlpha: 1, y: 0, duration: 0.6, ease: EASE, stagger: 0.06, clearProps: 'all' }),
  });
  return () => {
    triggers.forEach((trigger) => trigger.kill());
    gsap.set(elements, { clearProps: 'all' });
  };
}

// --- Numbers ---

// Counts from the value currently shown to `value`, writing `format(n)` into the element.
export function countTo(element, from, value, format) {
  if (!element) return;
  if (reduced() || from === value) {
    element.textContent = format(value);
    return;
  }
  const counter = { n: from };
  const whole = Number.isInteger(value) && Number.isInteger(from);
  counters.get(element)?.kill();
  counters.set(element, gsap.to(counter, {
    n: value,
    duration: 0.9,
    ease: 'power2.out',
    onUpdate: () => {
      element.textContent = format(whole ? Math.round(counter.n) : Math.round(counter.n * 100) / 100);
    },
  }));
}

// A heading or field coming into focus as a whole.
export function focusIn(element) {
  if (!element || reduced()) return;
  gsap.fromTo(element, { autoAlpha: 0, filter: 'blur(10px)', y: 8 }, { autoAlpha: 1, filter: 'blur(0px)', y: 0, duration: 0.7, ease: EASE, clearProps: 'all' });
}

// --- Pointer light ---

// A soft light that follows the pointer across `.spotlight` cards (no effect on touch).
export function startSpotlight() {
  if (reduced() || !matchMedia('(hover: hover)').matches) return;
  document.addEventListener(
    'pointermove',
    (event) => {
      const card = event.target.closest?.('.spotlight');
      if (!card) return;
      const box = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${event.clientX - box.left}px`);
      card.style.setProperty('--my', `${event.clientY - box.top}px`);
    },
    { passive: true },
  );
}
