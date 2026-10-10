# WanderPlan

A calm, fast trip planner. Lay out where you are staying, how you get between places, and what you
do each day, then see it on a timeline, as a day-by-day agenda, or traced across a spinning globe.

Live: https://ihosam.github.io/travel-planner/

## What it does

- **Stays, travel legs and activities** with times, costs and notes.
- **Timeline**: drag an activity to another day, drag the edge of a stay to change its dates, and
  zoom from the whole trip down to a single day (slider, Ctrl + scroll, or click a day).
- **Approvals**: changing a stay never silently moves a booking. Travel and stays that would have
  to follow are flagged, and you approve or keep each one (or all at once).
- **Agenda**: the same trip day by day, best on a phone.
- **Globe**: stays as beacons and travel as arcs on a 3D Earth you can turn and zoom.
- **Saves as you go** in your browser. The only thing ever sent anywhere is a place name, to
  Open-Meteo, when you ask the globe to locate a place.
- **Undo and redo** for every change (Ctrl/Cmd+Z), instead of "are you sure?" prompts.
- **Several trips**, each with its own currency.
- **Warns, never hides**: an activity left outside its stay is flagged and stays visible.
- **CSV import/export** (reads WanderPlan v2 files) and **calendar export** (.ics).
- **Motion with a purpose**: smooth page scrolling, activities and bookings glide to their new day,
  totals count to their new value, agenda days rise in as you scroll. All of it switches off with
  the system's "reduce motion" setting.
- Light and dark appearance, keyboard access (Alt + ←/→ moves a focused activity by a day; ←/→ on a
  stay's edge resizes it; arrow keys and +/− drive the globe).

## Run it

There is no build step and nothing to install. Serve the folder with any static server:

```
python -m http.server 8000
```

Then open http://localhost:8000. (Opening `index.html` straight from disk will not work, because
browsers only load JavaScript modules over http.)

Pushing to `main` publishes to GitHub Pages as-is.

## Tests

```
npm test
```

Uses Node's built-in test runner (Node 20+). No dependencies.

## How the code is organised

Dependencies point one way: `ui → state → domain`. The lower layers know nothing about the ones above.

```
index.html          page shell
styles/tokens.css   design tokens: every colour, radius and shadow, light and dark
styles/app.css      component styles
src/main.js         start-up: load saved state, create the store, render
src/domain/         the trip model. Pure functions, no DOM, fully tested
  trip.js             constructors, edits, rules, totals, agenda, resizing and approvals
  dates.js            date maths (UTC, so daylight saving cannot shift a day)
  geo.js              great-circle maths and the route a trip traces on the globe
  money.js  sample.js
src/state/          store with undo/redo, reducer, autosave
src/io/             CSV and iCalendar import/export, place lookup (geocode.js)
src/ui/             views (Preact + htm)
  app.js              shell; owns the open sheet and the toast
  timeline.js  agenda.js  editor.js  summary.js  toolbar.js
  approvals.js        the approve / keep popup
  globe.js            the globe view and its route list
  globe-renderer.js   the Earth itself: Canvas 2D, no WebGL, no libraries
  land-mask.js        where the land is (1 bit per square degree, 2 KB gzipped)
  controls.js         generic controls: menu, sheet, segmented control, toast
  motion.js           every animation and smooth scrolling; views ask for effects by name
vendor/             committed, pinned, no CDN at runtime:
                      htm + Preact 3.1.1 standalone (13 KB)
                      GSAP 3.15.0: gsap, Flip, ScrollTrigger, SplitText (loaded as classic scripts)
                      Lenis 1.3.26 (lenis.mjs + lenis.css)
tests/              unit tests for domain, io and state
```

### Common changes

| To… | Edit |
|---|---|
| add a way of travelling (e.g. tram) | `TRANSIT_METHODS` in `src/domain/trip.js`, plus an icon in `src/ui/icons.js` |
| add a currency | `CURRENCIES` in `src/domain/trip.js` |
| change a colour or the stay palette | `styles/tokens.css` |
| add a field to stays or activities | `createSegment` / `createActivity` in `trip.js`, the form in `ui/editor.js`, a column in `io/csv.js` |
| add a rule ("no activity before arrival") | `checkPlacement` / `tripIssues` in `trip.js`. The editor, drag-and-drop and warnings all use them |
| change what is saved | `src/state/persistence.js` (bump `VERSION` if the shape changes) |
| change which bookings a resize flags | `resizeStay` in `trip.js` |
| add or tune an animation | `src/ui/motion.js` (one place, honours reduced motion) |
| let an area keep native scrolling | add `data-lenis-prevent` to it |
| restyle the globe | colours and sizes at the top of `ui/globe-renderer.js`; panel tokens under `.globe` in `app.css` |

## Credits and terms

- Land shapes: [Natural Earth](https://www.naturalearthdata.com/) 1:110m (public domain), via world-atlas 2.0.2.
- Place search: [Open-Meteo Geocoding API](https://open-meteo.com/en/docs/geocoding-api), data from GeoNames
  (CC BY 4.0). Its free tier is for **non-commercial use**; a commercial deployment needs their paid
  plan or another geocoder (swap `src/io/geocode.js`).
- Icons: Lucide (ISC).
- Animation: [GSAP](https://gsap.com) under its standard no-charge licence: free in this app as long
  as users are never charged to use it, and not for building a competing visual animation tool.
- Smooth scrolling: [Lenis](https://github.com/darkroomengineering/lenis) (MIT).
- The count-up, blur-in and spotlight effects are our own versions of ideas from
  [React Bits](https://reactbits.dev); no React Bits code is included (its MIT + Commons Clause
  licence forbids redistributing ported components).
