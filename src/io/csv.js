// CSV import/export. The column layout matches WanderPlan v2 files, plus an optional Notes column.

const COLUMNS = [
  'RowLevel', 'SegmentID', 'ActivityID', 'SegmentType', 'Name', 'StartDate', 'StartTime',
  'EndDate', 'EndTime', 'Method', 'FlightNumber', 'Price', 'Notes', 'Lat', 'Lng', 'Place',
];

export function parseCSV(input) {
  const source = input.replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const endCell = () => {
    row.push(cell.trim());
    cell = '';
  };
  const endRow = () => {
    endCell();
    if (row.some((value) => value !== '')) rows.push(row);
    row = [];
  };
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') endCell();
    else if (char === '\n') endRow();
    else if (char !== '\r') cell += char;
  }
  endRow();
  return rows;
}

const escapeCell = (value) => {
  const cell = value == null ? '' : String(value);
  return /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
};

export function tripToCSV(trip) {
  const rows = [COLUMNS];
  for (const segment of trip.segments) {
    rows.push([
      'Segment', segment.id, '', segment.type, segment.name, segment.startDate, segment.startTime,
      segment.endDate, segment.endTime, segment.method ?? '', segment.reference ?? '', segment.price, segment.notes,
      segment.lat ?? '', segment.lng ?? '', segment.place ?? '',
    ]);
    for (const activity of segment.activities) {
      rows.push([
        'Activity', segment.id, activity.id, '', activity.name, activity.date, activity.time,
        '', '', '', '', activity.price, activity.notes,
      ]);
    }
  }
  return rows.map((row) => row.map(escapeCell).join(',')).join('\r\n');
}

// Returns plain segment records; pass them through createTrip() to normalise.
export function segmentsFromCSV(input) {
  const rows = parseCSV(input);
  if (!rows.length) throw new Error('This file is empty.');

  const header = rows[0].map((name) => name.toLowerCase());
  const hasHeader = header.includes('rowlevel');
  const column = (name) => {
    const index = hasHeader ? header.indexOf(name.toLowerCase()) : COLUMNS.indexOf(name);
    return (row) => (index >= 0 ? (row[index] ?? '') : '');
  };
  const get = Object.fromEntries(COLUMNS.map((name) => [name, column(name)]));

  const segments = [];
  const byId = new Map();
  for (const row of rows.slice(hasHeader ? 1 : 0)) {
    const level = get.RowLevel(row).toLowerCase();
    if (level === 'segment') {
      const segment = {
        id: get.SegmentID(row),
        type: get.SegmentType(row).toLowerCase() === 'transit' ? 'transit' : 'city',
        name: get.Name(row),
        startDate: get.StartDate(row),
        startTime: get.StartTime(row),
        endDate: get.EndDate(row),
        endTime: get.EndTime(row),
        method: get.Method(row).toLowerCase(),
        reference: get.FlightNumber(row),
        price: get.Price(row),
        notes: get.Notes(row),
        lat: get.Lat(row),
        lng: get.Lng(row),
        place: get.Place(row),
        activities: [],
      };
      segments.push(segment);
      if (segment.id) byId.set(segment.id, segment);
    } else if (level === 'activity') {
      byId.get(get.SegmentID(row))?.activities.push({
        id: get.ActivityID(row),
        name: get.Name(row),
        date: get.StartDate(row),
        time: get.StartTime(row),
        price: get.Price(row),
        notes: get.Notes(row),
      });
    }
  }
  if (!segments.length) throw new Error('No itinerary found in this file.');
  return segments;
}
