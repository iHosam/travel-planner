// Shown on first launch so the app never opens on a blank page.
export const sampleTrip = {
  name: 'Japan in Autumn',
  currency: 'USD',
  segments: [
    {
      type: 'city', name: 'Tokyo', lat: 35.6762, lng: 139.6503, place: 'Tokyo, Japan',
      startDate: '2026-10-15', startTime: '14:00', endDate: '2026-10-20', endTime: '08:00',
      activities: [
        { date: '2026-10-15', time: '16:00', name: 'Arrival & Shinjuku Neon Lights' },
        { date: '2026-10-16', time: '10:00', name: 'Shibuya Crossing & Meiji Shrine', price: 15 },
        { date: '2026-10-17', time: '11:00', name: 'Akihabara Electronics & Anime', price: 40 },
        { date: '2026-10-18', time: '09:00', name: 'Senso-ji Temple & Tokyo Skytree', price: 25 },
        { date: '2026-10-19', time: '08:30', name: 'Tsukiji Outer Market & Ginza Shopping', price: 60 },
      ],
    },
    {
      type: 'transit', method: 'train', name: 'Tokyo to Kyoto', reference: 'Nozomi 215',
      startDate: '2026-10-20', startTime: '09:00', endDate: '2026-10-20', endTime: '11:15', price: 95,
    },
    {
      type: 'city', name: 'Kyoto', lat: 35.0116, lng: 135.7681, place: 'Kyoto, Japan',
      startDate: '2026-10-20', startTime: '12:00', endDate: '2026-10-24', endTime: '09:00',
      activities: [
        { date: '2026-10-20', time: '14:00', name: 'Kinkaku-ji (Golden Pavilion)', price: 10 },
        { date: '2026-10-21', time: '07:30', name: 'Fushimi Inari Taisha Shrine' },
        { date: '2026-10-22', time: '08:00', name: 'Arashiyama Bamboo Grove & Monkey Park', price: 12 },
        { date: '2026-10-23', time: '18:00', name: 'Gion District Traditional Walk & Dinner', price: 80 },
      ],
    },
    {
      type: 'transit', method: 'bus', name: 'Kyoto to Osaka', reference: 'Keihan Express Bus',
      startDate: '2026-10-24', startTime: '10:00', endDate: '2026-10-24', endTime: '11:15', price: 15,
    },
    {
      type: 'city', name: 'Osaka', lat: 34.6937, lng: 135.5023, place: 'Osaka, Japan',
      startDate: '2026-10-24', startTime: '12:00', endDate: '2026-10-29', endTime: '11:00',
      activities: [
        { date: '2026-10-24', time: '18:00', name: 'Dotonbori Street Food Tour', price: 50 },
        { date: '2026-10-25', time: '08:00', name: 'Universal Studios Japan & Nintendo World', price: 110 },
        { date: '2026-10-26', time: '10:00', name: 'Osaka Castle & Nishinomaru Garden', price: 15 },
        { date: '2026-10-27', time: '11:00', name: 'Umeda Sky Building Observatory', price: 20 },
        { date: '2026-10-28', time: '09:00', name: 'Day Trip: Nara Deer Park & Todai-ji', price: 35 },
      ],
    },
    {
      type: 'transit', method: 'flight', name: 'Osaka to Riyadh', reference: 'EK317',
      lat: 24.7136, lng: 46.6753, place: 'Riyadh, Saudi Arabia',
      startDate: '2026-10-29', startTime: '14:00', endDate: '2026-10-29', endTime: '22:30', price: 850,
    },
  ],
};
