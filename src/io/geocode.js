// Place lookup through the Open-Meteo geocoding API (GeoNames data, CC BY 4.0).
// No key and no account. Only the place name being searched is sent, and only when the
// traveller asks for a place to be located.

const ENDPOINT = 'https://geocoding-api.open-meteo.com/v1/search';

export async function searchPlaces(name, { signal } = {}) {
  const query = name.trim();
  if (!query) return [];
  let response;
  try {
    response = await fetch(`${ENDPOINT}?name=${encodeURIComponent(query)}&count=5&language=en&format=json`, { signal });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('Place search needs an internet connection.');
  }
  if (!response.ok) throw new Error('Place search is unavailable right now.');
  const { results = [] } = await response.json();
  return results.map((result) => ({
    lat: result.latitude,
    lng: result.longitude,
    label: [result.name, result.admin1 !== result.name && result.admin1, result.country].filter(Boolean).join(', '),
  }));
}
