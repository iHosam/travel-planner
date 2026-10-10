// The timeline: one row per stay or travel leg, one column per day.

import { addDays, diffDays, eachDay, formatDay, formatTime, isWeekend, todayISO } from '../domain/dates.js';
import { formatMoney } from '../domain/money.js';
import { checkPlacement, tripRange } from '../domain/trip.js';
import { cx } from './controls.js';
import { Icon, segmentIcon } from './icons.js';
import { html, useEffect, useLayoutEffect, useMemo, useRef, useState } from './lib.js';

// Zoom is the width of one day in pixels. Below `full` chips lose detail; below `mid` they become bars.
export const ZOOM = { min: 8, max: 260, detail: 132, full: 104, mid: 44 };

const clampZoom = (value) => Math.round(Math.min(ZOOM.max, Math.max(ZOOM.min, value)));
const toSlider = (width) => Math.round((Math.log(clampZoom(width) / ZOOM.min) / Math.log(ZOOM.max / ZOOM.min)) * 100);
const fromSlider = (value) => ZOOM.min * (ZOOM.max / ZOOM.min) ** (value / 100);

// Each stay gets its own colour so the plan reads at a glance.
export function segmentColors(trip) {
  const colors = new Map();
  let stays = 0;
  for (const segment of trip.segments) {
    colors.set(segment.id, segment.type === 'city' ? `var(--stay-${(stays++ % 6) + 1})` : 'var(--transit)');
  }
  return colors;
}

export function describeSpan(segment) {
  if (segment.type === 'city') {
    const nights = diffDays(segment.startDate, segment.endDate);
    const span = `${formatDay(segment.startDate)} – ${formatDay(segment.endDate)}`;
    return nights > 0 ? `${span} · ${nights} ${nights === 1 ? 'night' : 'nights'}` : formatDay(segment.startDate);
  }
  const times = [segment.startTime, segment.endTime].filter(Boolean).map(formatTime).join(' – ');
  return [formatDay(segment.startDate), times].filter(Boolean).join(' · ');
}

export const signedDays = (days) => `${days > 0 ? '+' : '−'}${Math.abs(days)} ${Math.abs(days) === 1 ? 'day' : 'days'}`;

export function Timeline({ trip, zoom, onZoom, actions }) {
  const scroller = useRef(null);
  const anchor = useRef(null); // keeps a point of the timeline still while zooming
  const justResized = useRef(false);
  const [width, setWidth] = useState(0);
  const [drag, setDrag] = useState(null); // { segmentId, activity }
  const [over, setOver] = useState(null); // { segmentId, date, error }
  const [resize, setResize] = useState(null); // { segmentId, edge, date }

  const colors = useMemo(() => segmentColors(trip), [trip]);
  const today = todayISO();
  const days = useMemo(() => {
    const range = tripRange(trip);
    const preview = resize?.date;
    return eachDay(preview && preview < range.start ? preview : range.start, preview && preview > range.end ? preview : range.end);
  }, [trip, resize?.date]);

  const labelWidth = width && width < 560 ? 132 : 216;
  // Columns never get narrower than what fills the card, so "fit" is also the furthest zoom out.
  const fitWidth = Math.max((width - labelWidth) / days.length, 4);
  const dayWidth = zoom === 'fit' ? fitWidth : Math.max(zoom, fitWidth);
  const detail = dayWidth >= ZOOM.full ? 'full' : dayWidth >= ZOOM.mid ? 'mid' : 'min';
  const live = useRef({});
  live.current = { dayWidth, fitWidth, labelWidth, width };

  useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(scroller.current);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (!anchor.current) return;
    const { day, offset } = anchor.current;
    anchor.current = null;
    scroller.current.scrollLeft = labelWidth + day * dayWidth - offset;
  }, [zoom]);

  // `day` is a fractional column index; `offset` is where it should sit, in pixels from the left edge.
  const zoomTo = (next, around) => {
    const { dayWidth: current, fitWidth: fit, labelWidth: label, width: visible } = live.current;
    const offset = around?.offset ?? label + (visible - label) / 2;
    const day = around?.day ?? (offset + scroller.current.scrollLeft - label) / current;
    anchor.current = { day, offset };
    onZoom(next === 'fit' || next <= fit ? 'fit' : clampZoom(next));
  };

  // Ctrl/⌘ + wheel, which is also what a trackpad pinch sends.
  useEffect(() => {
    const element = scroller.current;
    const onWheel = (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const { dayWidth: current, labelWidth: label } = live.current;
      const offset = event.clientX - element.getBoundingClientRect().left;
      const speed = Math.abs(event.deltaY) < 50 ? 0.01 : 0.002;
      zoomTo(current * Math.exp(-event.deltaY * speed), { offset, day: (offset + element.scrollLeft - label) / current });
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, []);

  const endDrag = () => {
    setDrag(null);
    setOver(null);
  };

  // Dragging an edge follows the pointer on the window, because the handle itself moves cells.
  const startResize = (event, segment, edge) => {
    event.preventDefault();
    event.stopPropagation();
    const from = edge === 'end' ? segment.endDate : segment.startDate;
    const originX = event.clientX;
    const originScroll = scroller.current.scrollLeft;
    let date = from;

    const move = (moveEvent) => {
      const distance = moveEvent.clientX - originX + scroller.current.scrollLeft - originScroll;
      let next = addDays(from, Math.round(distance / live.current.dayWidth));
      if (edge === 'end' && next < segment.startDate) next = segment.startDate;
      if (edge === 'start' && next > segment.endDate) next = segment.endDate;
      if (next === date) return;
      date = next;
      setResize({ segmentId: segment.id, edge, date });
    };
    const finish = (commit) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', onKey);
      setResize(null);
      justResized.current = true;
      setTimeout(() => (justResized.current = false), 250);
      if (commit && date !== from) actions.resizeStay(segment.id, edge, date);
    };
    const release = () => finish(true);
    const cancel = () => finish(false);
    const onKey = (keyEvent) => keyEvent.key === 'Escape' && finish(false);

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', onKey);
    setResize({ segmentId: segment.id, edge, date });
  };

  const renderHandle = (segment, edge) => {
    const date = edge === 'end' ? segment.endDate : segment.startDate;
    const nudge = (step) => {
      actions.resizeStay(segment.id, edge, addDays(date, step));
      requestAnimationFrame(() => document.querySelector(`[data-handle="${segment.id}:${edge}"]`)?.focus());
    };
    return html`
      <span class=${cx('tl-handle', edge)} role="slider" tabindex="0" data-handle=${`${segment.id}:${edge}`}
        aria-label=${`${segment.name} ${edge === 'end' ? 'departure' : 'arrival'} date`} aria-valuetext=${formatDay(date, 'medium')}
        title="Drag to change dates"
        onPointerDown=${(event) => startResize(event, segment, edge)}
        onClick=${(event) => event.stopPropagation()}
        onKeyDown=${(event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          nudge(event.key === 'ArrowLeft' ? -1 : 1);
        }}></span>
    `;
  };

  const renderChip = (segment, activity) => {
    const problem = checkPlacement(segment, activity.date, activity.time);
    const nudge = (step) => {
      actions.moveActivity(segment.id, activity.id, segment.id, addDays(activity.date, step));
      requestAnimationFrame(() => document.querySelector(`[data-activity="${activity.id}"]`)?.focus());
    };
    return html`
      <div key=${activity.id} class=${cx('chip', problem && 'warn', drag?.activity.id === activity.id && 'lifted')}
        role="button" tabindex="0" draggable="true" data-activity=${activity.id}
        title=${problem ?? `${activity.name} · drag to another day, or press Alt + ← / →`}
        onClick=${(event) => {
          event.stopPropagation();
          actions.editActivity(segment.id, activity.id);
        }}
        onKeyDown=${(event) => {
          if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
            event.preventDefault();
            nudge(event.key === 'ArrowLeft' ? -1 : 1);
          } else if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            actions.editActivity(segment.id, activity.id);
          }
        }}
        onDragStart=${(event) => {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', activity.name);
          setDrag({ segmentId: segment.id, activity });
        }}
        onDragEnd=${endDrag}>
        ${activity.time && html`<span class="chip-time">${formatTime(activity.time)}</span>`}
        <span class="chip-name">${activity.name}</span>
        ${activity.price > 0 && html`<span class="chip-price">${formatMoney(activity.price, trip.currency)}</span>`}
      </div>
    `;
  };

  const renderRow = (segment) => {
    const isCity = segment.type === 'city';
    const color = colors.get(segment.id);
    const icon = segmentIcon(segment);
    const resizing = resize?.segmentId === segment.id;
    // While an edge is being dragged the row shows where it would land.
    const shown = resizing ? { ...segment, [resize.edge === 'end' ? 'endDate' : 'startDate']: resize.date } : segment;
    const shift = segment.pendingShift ?? 0;
    const proposed = shift ? { start: addDays(segment.startDate, shift), end: addDays(segment.endDate, shift) } : null;

    const cells = days.map((date) => {
      const inRange = date >= shown.startDate && date <= shown.endDate;
      const addable = isCity && inRange;
      const isOver = over?.segmentId === segment.id && over.date === date;
      const activities = isCity ? segment.activities.filter((activity) => activity.date === date) : [];
      const dropTarget = isCity && drag;
      const ghost = proposed !== null && date >= proposed.start && date <= proposed.end;

      return html`
        <div key=${`${segment.id}:${date}`} style=${`--c:${color}`}
          class=${cx(
            'tl-cell',
            inRange && 'in',
            date === shown.startDate && 'start',
            date === shown.endDate && 'end',
            isWeekend(date) && 'weekend',
            addable && 'addable',
            isOver && (over.error ? 'drop-no' : 'drop-ok'),
          )}
          onClick=${addable
            ? () => {
                if (!justResized.current) actions.newActivity(segment.id, date);
              }
            : undefined}
          onDragOver=${dropTarget
            ? (event) => {
                const error = checkPlacement(segment, date, drag.activity.time);
                if (!error) {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                }
                if (!isOver) setOver({ segmentId: segment.id, date, error });
              }
            : undefined}
          onDragLeave=${dropTarget
            ? (event) => {
                if (isOver && !event.currentTarget.contains(event.relatedTarget)) setOver(null);
              }
            : undefined}
          onDrop=${dropTarget
            ? (event) => {
                event.preventDefault();
                actions.moveActivity(drag.segmentId, drag.activity.id, segment.id, date);
                endDrag();
              }
            : undefined}>
          ${ghost &&
          html`<span class=${cx('tl-ghost', date === proposed.start && 'start', date === proposed.end && 'end')}></span>`}
          ${!isCity &&
          date === segment.startDate &&
          html`
            <span class="tl-leg">
              <${Icon} name=${icon} size=${16} />
              ${detail === 'full' && segment.startTime && html`<span>${formatTime(segment.startTime)}</span>`}
            </span>
          `}
          ${activities.map((activity) => renderChip(segment, activity))}
          ${isCity && date === shown.startDate && renderHandle(segment, 'start')}
          ${isCity && date === shown.endDate && renderHandle(segment, 'end')}
        </div>
      `;
    });

    return html`
      <button key=${segment.id} type="button" class=${cx('tl-label', !isCity && 'transit')} style=${`--c:${color}`}
        title=${`Edit ${segment.name}`} onClick=${() => actions.editSegment(segment.id)}>
        <span class="badge"><${Icon} name=${icon} size=${16} /></span>
        <span class="tl-label-text">
          <strong>${segment.name}</strong>
          <small>${resizing ? describeSpan(shown) : describeSpan(segment)}</small>
          ${shift
            ? html`<small class="pending-tag">Awaiting approval · ${signedDays(shift)}</small>`
            : segment.reference && html`<small class="reference">${segment.reference}</small>`}
        </span>
      </button>
      ${cells}
    `;
  };

  return html`
    <section class=${cx('card', 'timeline', `detail-${detail}`, drag && 'dragging', resize && 'resizing')}
      aria-label="Trip timeline">
      <div class="tl-bar">
        <span class="tl-tip">Drag the edge of a stay to change its dates</span>
        <div class="zoom" role="group" aria-label="Zoom">
          <button type="button" class="icon-btn" aria-label="Zoom out" title="Zoom out"
            disabled=${dayWidth <= fitWidth} onClick=${() => zoomTo(dayWidth / 1.5)}>
            <${Icon} name="minus" size=${16} />
          </button>
          <input class="zoom-slider" type="range" min="0" max="100" aria-label="Zoom level" title="Ctrl + scroll also zooms"
            value=${toSlider(dayWidth)} onInput=${(event) => zoomTo(fromSlider(Number(event.target.value)))} />
          <button type="button" class="icon-btn" aria-label="Zoom in" title="Zoom in"
            disabled=${dayWidth >= ZOOM.max} onClick=${() => zoomTo(dayWidth * 1.5)}>
            <${Icon} name="plus" size=${16} />
          </button>
          <button type="button" class=${cx('zoom-fit', dayWidth <= fitWidth && 'on')} aria-pressed=${String(dayWidth <= fitWidth)}
            title="Show the whole trip" onClick=${() => zoomTo(dayWidth <= fitWidth ? ZOOM.detail : 'fit')}>
            Fit
          </button>
        </div>
      </div>
      <div class="tl-scroll" ref=${scroller}>
        <div class="tl-grid" style=${`--days:${days.length};--label:${labelWidth}px;--day:${zoom === 'fit' ? 0 : zoom}px`}>
          <div class="tl-corner"></div>
          ${days.map(
            (date, index) => html`
              <button key=${date} type="button" tabindex=${detail === 'full' ? -1 : 0}
                class=${cx('tl-day', isWeekend(date) && 'weekend', date === today && 'today')}
                title=${detail === 'full' ? formatDay(date, 'medium') : `Zoom in on ${formatDay(date, 'medium')}`}
                onClick=${() => detail !== 'full' && zoomTo(ZOOM.detail, { day: index + 0.5 })}>
                <span class="tl-weekday">
                  ${(index === 0 || date.endsWith('-01')) && html`<b>${formatDay(date, 'month')}</b> `}${formatDay(date, 'weekday')}
                </span>
                <span class="tl-daynum">${formatDay(date, 'day')}</span>
              </button>
            `,
          )}
          ${trip.segments.map(renderRow)}
          <button type="button" class="tl-label tl-add" onClick=${() => actions.newSegment()}>
            <span class="badge"><${Icon} name="plus" size=${16} /></span>
            <span class="tl-label-text"><strong>Add</strong></span>
          </button>
          <div class="tl-add-fill"></div>
        </div>
      </div>
      ${over?.error && html`<p class="tl-hint" role="status">${over.error}</p>`}
    </section>
  `;
}
