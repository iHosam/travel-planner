// Small reusable controls. None of them know anything about trips.

import { Icon } from './icons.js';
import { html, useEffect, useRef, useState } from './lib.js';

export const cx = (...parts) => parts.filter(Boolean).join(' ');

export function Segmented({ label, value, options, onChange }) {
  return html`
    <div class="segmented" role="group" aria-label=${label}>
      ${options.map(
        (option) => html`
          <button type="button" class=${cx('segment', option.value === value && 'on')}
            aria-pressed=${String(option.value === value)} onClick=${() => onChange(option.value)}>
            ${option.label}
          </button>
        `,
      )}
    </div>
  `;
}

// items: { label, onSelect, checked?, danger?, disabled? } | { heading } | '-'
export function Menu({ label, icon, text, items, align = 'end' }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    wrap.current.querySelector('.menu-item:not(:disabled)')?.focus();
    const onPointerDown = (event) => {
      if (!wrap.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        wrap.current?.querySelector('button')?.focus();
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const options = [...wrap.current.querySelectorAll('.menu-item:not(:disabled)')];
        const next = options.indexOf(document.activeElement) + (event.key === 'ArrowDown' ? 1 : -1);
        options[(next + options.length) % options.length]?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const renderItem = (item) => {
    if (item === '-') return html`<hr />`;
    if (item.heading) return html`<div class="menu-heading">${item.heading}</div>`;
    const checkable = item.checked !== undefined;
    return html`
      <button type="button" class=${cx('menu-item', item.danger && 'danger')} disabled=${item.disabled}
        role=${checkable ? 'menuitemradio' : 'menuitem'} aria-checked=${checkable ? String(item.checked) : undefined}
        onClick=${() => {
          setOpen(false);
          item.onSelect();
        }}>
        <span class="menu-check">${item.checked && html`<${Icon} name="check" size=${14} />`}</span>
        <span class="menu-label">${item.label}</span>
      </button>
    `;
  };

  return html`
    <div class="menu-wrap" ref=${wrap}>
      <button type="button" class=${text ? 'trip-button' : 'icon-btn'} aria-haspopup="menu"
        aria-expanded=${String(open)} aria-label=${label} title=${label} onClick=${() => setOpen(!open)}>
        ${text
          ? html`<span class="trip-button-text">${text}</span><${Icon} name="chevron" size=${14} />`
          : html`<${Icon} name=${icon} />`}
      </button>
      ${open && html`<div class=${cx('menu', `align-${align}`)} role="menu" aria-label=${label} data-lenis-prevent>${items.map(renderItem)}</div>`}
    </div>
  `;
}

// A modal sheet built on <dialog>, which provides focus trapping and Escape for free.
export function Sheet({ title, submitLabel = 'Save', onSubmit, onClose, children }) {
  const dialog = useRef(null);
  const pressedBackdrop = useRef(false);

  useEffect(() => {
    dialog.current.showModal();
  }, []);

  return html`
    <dialog class="sheet" ref=${dialog} data-lenis-prevent aria-label=${title} onClose=${onClose}
      onPointerDown=${(event) => {
        pressedBackdrop.current = event.target === dialog.current;
      }}
      onClick=${(event) => {
        if (pressedBackdrop.current && event.target === dialog.current) onClose();
      }}>
      <form class="sheet-form" novalidate=${true} onSubmit=${onSubmit}>
        <header class="sheet-header">
          <button type="button" class="btn plain" onClick=${onClose}>Cancel</button>
          <h2>${title}</h2>
          <button type="submit" class="btn plain strong">${submitLabel}</button>
        </header>
        <div class="sheet-body">${children}</div>
      </form>
    </dialog>
  `;
}

export function Field({ label, error, wide, children }) {
  return html`
    <label class=${cx('field', wide && 'wide', error && 'invalid')}>
      <span class="field-label">${label}</span>
      ${children}
      ${error && html`<span class="field-error" role="alert">${error}</span>`}
    </label>
  `;
}

export function Toast({ toast, onDismiss }) {
  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(onDismiss, toast.action ? 7000 : 4000);
    return () => clearTimeout(timer);
  }, [toast?.id]);

  return html`
    <div class="toast-region" role="status" aria-live="polite">
      ${toast &&
      html`
        <div class=${cx('toast', toast.tone)} key=${toast.id}>
          <span>${toast.message}</span>
          ${toast.action &&
          html`
            <button type="button" class="toast-action"
              onClick=${() => {
                toast.action.run();
                onDismiss();
              }}>
              ${toast.action.label}
            </button>
          `}
        </div>
      `}
    </div>
  `;
}
