// data.js – Full match data + player predictions (global)

// Players
const PLAYERS = [
  { name: 'Amit',      color: '#5b6cf6', bg: '#eeedfe', textc: '#3C3489', initials: 'AM' },
  { name: 'Barun',     color: '#1a6b3a', bg: '#e8f5ee', textc: '#0f4a27', initials: 'BA' },
  { name: 'Prashanna', color: '#d97706', bg: '#faeeda', textc: '#633806', initials: 'PR' },
  { name: 'Rishav',    color: '#e05252', bg: '#fcebeb', textc: '#791f1f', initials: 'RI' },
  { name: 'Sweastik',  color: '#7c3aed', bg: '#eeedfe', textc: '#26215C', initials: 'SW' },
];

// ---------- Helper function (moved before first use) ----------
function formatDateForDisplay(dt) {
  const [date, time] = dt.split(' ');
  const [month, day] = date.split('-').slice(1);
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${monthNames[parseInt(month)-1]} ${parseInt(day)} · ${time}`;
}

// ---------- Full 72 matches from your JSON ----------
const RAW_MATCHES = [
  { match_id: 1, date_time_pt: "2026-06-11 12:00", stadium: "Mexico City Stadium", home_team: "Mexico", away_team: "South Africa", group: "A", score: "2 - 0" },
  { match_id: 2, date_time_pt: "2026-06-11 19:00", stadium: "Guadalajara Stadium", home_team: "Korea Republic", away_team: "Czechia", group: "A", score: "2 - 1" },
  { match_id: 3, date_time_pt: "2026-06-12 12:00", stadium: "Toronto Stadium", home_team: "Canada", away_team: "Bosnia and Herzegovina", group: "B", score: "1 - 1" },
  { match_id: 4, date_time_pt: "2026-06-12 18:00", stadium: "Los Angeles Stadium", home_team: "USA", away_team: "Paraguay", group: "D", score: "4 - 1" },
  { match_id: 5, date_time_pt: "2026-06-13 12:00", stadium: "San Francisco Bay Area Stadium", home_team: "Qatar", away_team: "Switzerland", group: "B", score: "0 - 0" },
  { match_id: 6, date_time_pt: "2026-06-13 15:00", stadium: "New York/New Jersey Stadium", home_team: "Brazil", away_team: "Morocco", group: "C", score: "0 - 0" },
  { match_id: 7, date_time_pt: "2026-06-13 18:00", stadium: "Boston Stadium", home_team: "Haiti", away_team: "Scotland", group: "C", score: "0 - 0" },
  { match_id: 8, date_time_pt: "2026-06-13 21:00", stadium: "BC Place Vancouver", home_team: "Australia", away_team: "Türkiye", group: "D", score: "0 - 0" },
  { match_id: 9, date_time_pt: "2026-06-14 10:00", stadium: "Houston Stadium", home_team: "Germany", away_team: "Curaçao", group: "E", score: "0 - 0" },
  { match_id: 10, date_time_pt: "2026-06-14 13:00", stadium: "Dallas Stadium", home_team: "Netherlands", away_team: "Japan", group: "F", score: "0 - 0" },
  { match_id: 11, date_time_pt: "2026-06-14 16:00", stadium: "Philadelphia Stadium", home_team: "Côte d'Ivoire", away_team: "Ecuador", group: "E", score: "0 - 0" },
  { match_id: 12, date_time_pt: "2026-06-14 19:00", stadium: "Monterrey Stadium", home_team: "Sweden", away_team: "Tunisia", group: "F", score: "0 - 0" },
  { match_id: 13, date_time_pt: "2026-06-15 09:00", stadium: "Atlanta Stadium", home_team: "Spain", away_team: "Cabo Verde", group: "H", score: "0 - 0" },
  { match_id: 14, date_time_pt: "2026-06-15 12:00", stadium: "Seattle Stadium", home_team: "Belgium", away_team: "Egypt", group: "G", score: "0 - 0" },
  { match_id: 15, date_time_pt: "2026-06-15 15:00", stadium: "Miami Stadium", home_team: "Saudi Arabia", away_team: "Uruguay", group: "H", score: "0 - 0" },
  { match_id: 16, date_time_pt: "2026-06-15 18:00", stadium: "Los Angeles Stadium", home_team: "IR Iran", away_team: "New Zealand", group: "G", score: "0 - 0" },
  { match_id: 17, date_time_pt: "2026-06-16 12:00", stadium: "New York/New Jersey Stadium", home_team: "France", away_team: "Senegal", group: "I", score: "0 - 0" },
  { match_id: 18, date_time_pt: "2026-06-16 15:00", stadium: "Boston Stadium", home_team: "Iraq", away_team: "Norway", group: "I", score: "0 - 0" },
  { match_id: 19, date_time_pt: "2026-06-16 18:00", stadium: "Kansas City Stadium", home_team: "Argentina", away_team: "Algeria", group: "J", score: "0 - 0" },
  { match_id: 20, date_time_pt: "2026-06-16 21:00", stadium: "San Francisco Bay Area Stadium", home_team: "Austria", away_team: "Jordan", group: "J", score: "0 - 0" },
  { match_id: 21, date_time_pt: "2026-06-17 10:00", stadium: "Houston Stadium", home_team: "Portugal", away_team: "Congo DR", group: "K", score: "0 - 0" },
  { match_id: 22, date_time_pt: "2026-06-17 13:00", stadium: "Dallas Stadium", home_team: "England", away_team: "Croatia", group: "L", score: "0 - 0" },
  { match_id: 23, date_time_pt: "2026-06-17 16:00", stadium: "Toronto Stadium", home_team: "Ghana", away_team: "Panama", group: "L", score: "0 - 0" },
  { match_id: 24, date_time_pt: "2026-06-17 19:00", stadium: "Mexico City Stadium", home_team: "Uzbekistan", away_team: "Colombia", group: "K", score: "0 - 0" },
  { match_id: 25, date_time_pt: "2026-06-18 09:00", stadium: "Atlanta Stadium", home_team: "Czechia", away_team: "South Africa", group: "A", score: "0 - 0" },
  { match_id: 26, date_time_pt: "2026-06-18 12:00", stadium: "Los Angeles Stadium", home_team: "Switzerland", away_team: "Bosnia and Herzegovina", group: "B", score: "0 - 0" },
  { match_id: 27, date_time_pt: "2026-06-18 15:00", stadium: "BC Place Vancouver", home_team: "Canada", away_team: "Qatar", group: "B", score: "0 - 0" },
  { match_id: 28, date_time_pt: "2026-06-18 18:00", stadium: "Guadalajara Stadium", home_team: "Mexico", away_team: "Korea Republic", group: "A", score: "0 - 0" },
  { match_id: 29, date_time_pt: "2026-06-19 12:00", stadium: "Seattle Stadium", home_team: "USA", away_team: "Australia", group: "D", score: "0 - 0" },
  { match_id: 30, date_time_pt: "2026-06-19 15:00", stadium: "Boston Stadium", home_team: "Scotland", away_team: "Morocco", group: "C", score: "0 - 0" },
  { match_id: 31, date_time_pt: "2026-06-19 18:00", stadium: "Philadelphia Stadium", home_team: "Brazil", away_team: "Haiti", group: "C", score: "0 - 0" },
  { match_id: 32, date_time_pt: "2026-06-19 21:00", stadium: "San Francisco Bay Area Stadium", home_team: "Türkiye", away_team: "Paraguay", group: "D", score: "0 - 0" },
  { match_id: 33, date_time_pt: "2026-06-20 10:00", stadium: "Houston Stadium", home_team: "Netherlands", away_team: "Sweden", group: "F", score: "0 - 0" },
  { match_id: 34, date_time_pt: "2026-06-20 13:00", stadium: "Toronto Stadium", home_team: "Germany", away_team: "Côte d'Ivoire", group: "E", score: "0 - 0" },
  { match_id: 35, date_time_pt: "2026-06-20 17:00", stadium: "Kansas City Stadium", home_team: "Ecuador", away_team: "Curaçao", group: "E", score: "0 - 0" },
  { match_id: 36, date_time_pt: "2026-06-20 21:00", stadium: "Monterrey Stadium", home_team: "Tunisia", away_team: "Japan", group: "F", score: "0 - 0" },
  { match_id: 37, date_time_pt: "2026-06-21 09:00", stadium: "Atlanta Stadium", home_team: "Spain", away_team: "Saudi Arabia", group: "H", score: "0 - 0" },
  { match_id: 38, date_time_pt: "2026-06-21 12:00", stadium: "Los Angeles Stadium", home_team: "Belgium", away_team: "IR Iran", group: "G", score: "0 - 0" },
  { match_id: 39, date_time_pt: "2026-06-21 15:00", stadium: "Miami Stadium", home_team: "Uruguay", away_team: "Cabo Verde", group: "H", score: "0 - 0" },
  { match_id: 40, date_time_pt: "2026-06-21 18:00", stadium: "BC Place Vancouver", home_team: "New Zealand", away_team: "Egypt", group: "G", score: "0 - 0" },
  { match_id: 41, date_time_pt: "2026-06-22 10:00", stadium: "Dallas Stadium", home_team: "Argentina", away_team: "Austria", group: "J", score: "0 - 0" },
  { match_id: 42, date_time_pt: "2026-06-22 14:00", stadium: "Philadelphia Stadium", home_team: "France", away_team: "Iraq", group: "I", score: "0 - 0" },
  { match_id: 43, date_time_pt: "2026-06-22 17:00", stadium: "New York/New Jersey Stadium", home_team: "Norway", away_team: "Senegal", group: "I", score: "0 - 0" },
  { match_id: 44, date_time_pt: "2026-06-22 20:00", stadium: "San Francisco Bay Area Stadium", home_team: "Jordan", away_team: "Algeria", group: "J", score: "0 - 0" },
  { match_id: 45, date_time_pt: "2026-06-23 10:00", stadium: "Houston Stadium", home_team: "Portugal", away_team: "Uzbekistan", group: "K", score: "0 - 0" },
  { match_id: 46, date_time_pt: "2026-06-23 13:00", stadium: "Boston Stadium", home_team: "England", away_team: "Ghana", group: "L", score: "0 - 0" },
  { match_id: 47, date_time_pt: "2026-06-23 16:00", stadium: "Toronto Stadium", home_team: "Panama", away_team: "Croatia", group: "L", score: "0 - 0" },
  { match_id: 48, date_time_pt: "2026-06-23 19:00", stadium: "Guadalajara Stadium", home_team: "Colombia", away_team: "Congo DR", group: "K", score: "0 - 0" },
  { match_id: 49, date_time_pt: "2026-06-24 12:00", stadium: "BC Place Vancouver", home_team: "Switzerland", away_team: "Canada", group: "B", score: "0 - 0" },
  { match_id: 50, date_time_pt: "2026-06-24 12:00", stadium: "Seattle Stadium", home_team: "Bosnia and Herzegovina", away_team: "Qatar", group: "B", score: "0 - 0" },
  { match_id: 51, date_time_pt: "2026-06-24 15:00", stadium: "Miami Stadium", home_team: "Scotland", away_team: "Brazil", group: "C", score: "0 - 0" },
  { match_id: 52, date_time_pt: "2026-06-24 15:00", stadium: "Atlanta Stadium", home_team: "Morocco", away_team: "Haiti", group: "C", score: "0 - 0" },
  { match_id: 53, date_time_pt: "2026-06-24 18:00", stadium: "Mexico City Stadium", home_team: "Czechia", away_team: "Mexico", group: "A", score: "0 - 0" },
  { match_id: 54, date_time_pt: "2026-06-24 18:00", stadium: "Monterrey Stadium", home_team: "South Africa", away_team: "Korea Republic", group: "A", score: "0 - 0" },
  { match_id: 55, date_time_pt: "2026-06-25 13:00", stadium: "Philadelphia Stadium", home_team: "Curaçao", away_team: "Côte d'Ivoire", group: "E", score: "0 - 0" },
  { match_id: 56, date_time_pt: "2026-06-25 13:00", stadium: "New York/New Jersey Stadium", home_team: "Ecuador", away_team: "Germany", group: "E", score: "0 - 0" },
  { match_id: 57, date_time_pt: "2026-06-25 16:00", stadium: "Dallas Stadium", home_team: "Japan", away_team: "Sweden", group: "F", score: "0 - 0" },
  { match_id: 58, date_time_pt: "2026-06-25 16:00", stadium: "Kansas City Stadium", home_team: "Tunisia", away_team: "Netherlands", group: "F", score: "0 - 0" },
  { match_id: 59, date_time_pt: "2026-06-25 19:00", stadium: "Los Angeles Stadium", home_team: "Türkiye", away_team: "USA", group: "D", score: "0 - 0" },
  { match_id: 60, date_time_pt: "2026-06-25 19:00", stadium: "San Francisco Bay Area Stadium", home_team: "Paraguay", away_team: "Australia", group: "D", score: "0 - 0" },
  { match_id: 61, date_time_pt: "2026-06-26 12:00", stadium: "Boston Stadium", home_team: "Norway", away_team: "France", group: "I", score: "0 - 0" },
  { match_id: 62, date_time_pt: "2026-06-26 12:00", stadium: "Toronto Stadium", home_team: "Senegal", away_team: "Iraq", group: "I", score: "0 - 0" },
  { match_id: 63, date_time_pt: "2026-06-26 17:00", stadium: "Houston Stadium", home_team: "Cabo Verde", away_team: "Saudi Arabia", group: "H", score: "0 - 0" },
  { match_id: 64, date_time_pt: "2026-06-26 17:00", stadium: "Guadalajara Stadium", home_team: "Uruguay", away_team: "Spain", group: "H", score: "0 - 0" },
  { match_id: 65, date_time_pt: "2026-06-26 20:00", stadium: "Seattle Stadium", home_team: "Egypt", away_team: "IR Iran", group: "G", score: "0 - 0" },
  { match_id: 66, date_time_pt: "2026-06-26 20:00", stadium: "BC Place Vancouver", home_team: "New Zealand", away_team: "Belgium", group: "G", score: "0 - 0" },
  { match_id: 67, date_time_pt: "2026-06-27 14:00", stadium: "New York/New Jersey Stadium", home_team: "Panama", away_team: "England", group: "L", score: "0 - 0" },
  { match_id: 68, date_time_pt: "2026-06-27 14:00", stadium: "Philadelphia Stadium", home_team: "Croatia", away_team: "Ghana", group: "L", score: "0 - 0" },
  { match_id: 69, date_time_pt: "2026-06-27 16:30", stadium: "Miami Stadium", home_team: "Colombia", away_team: "Portugal", group: "K", score: "0 - 0" },
  { match_id: 70, date_time_pt: "2026-06-27 16:30", stadium: "Atlanta Stadium", home_team: "Congo DR", away_team: "Uzbekistan", group: "K", score: "0 - 0" },
  { match_id: 71, date_time_pt: "2026-06-27 19:00", stadium: "Kansas City Stadium", home_team: "Algeria", away_team: "Austria", group: "J", score: "0 - 0" },
  { match_id: 72, date_time_pt: "2026-06-27 19:00", stadium: "Dallas Stadium", home_team: "Jordan", away_team: "Argentina", group: "J", score: "0 - 0" }
];

// Original predictions from the first 24 matches (preserved)
const ORIGINAL_PREDS_MAP = {
  "Mexico vs. South Africa": [
    { p: "Amit", h: null, a: null }, { p: "Barun", h: 2, a: 0 }, { p: "Prashanna", h: 3, a: 0 }, { p: "Rishav", h: 1, a: 2 }, { p: "Sweastik", h: 2, a: 1 }
  ],
  "Korea Republic vs. Czechia": [
    { p: "Amit", h: null, a: null }, { p: "Barun", h: 2, a: 1 }, { p: "Prashanna", h: 2, a: 0 }, { p: "Rishav", h: 1, a: 0 }, { p: "Sweastik", h: 2, a: 0 }
  ],
  "Canada vs. Bosnia and Herzegovina": [
    { p: "Amit", h: null, a: null }, { p: "Barun", h: 2, a: 0 }, { p: "Prashanna", h: 1, a: 2 }, { p: "Rishav", h: 2, a: 0 }, { p: "Sweastik", h: 2, a: 1 }
  ],
  "USA vs. Paraguay": [
    { p: "Amit", h: null, a: null }, { p: "Barun", h: 3, a: 1 }, { p: "Prashanna", h: 2, a: 1 }, { p: "Rishav", h: 3, a: 1 }, { p: "Sweastik", h: 2, a: 0 }
  ],
  "Germany vs. Curaçao": [
    { p: "Amit", h: 5, a: 0 }, { p: "Barun", h: 4, a: 0 }, { p: "Prashanna", h: 4, a: 0 }, { p: "Rishav", h: null, a: null }, { p: "Sweastik", h: 3, a: 0 }
  ],
  "Brazil vs. Morocco": [
    { p: "Amit", h: 2, a: 1 }, { p: "Barun", h: 3, a: 1 }, { p: "Prashanna", h: null, a: null }, { p: "Rishav", h: null, a: null }, { p: "Sweastik", h: 3, a: 1 }
  ],
  "Netherlands vs. Japan": [
    { p: "Amit", h: 2, a: 0 }, { p: "Barun", h: 3, a: 2 }, { p: "Prashanna", h: null, a: null }, { p: "Rishav", h: null, a: null }, { p: "Sweastik", h: 3, a: 1 }
  ],
  "Australia vs. Türkiye": [
    { p: "Amit", h: 0, a: 2 }, { p: "Barun", h: null, a: null }, { p: "Prashanna", h: null, a: null }, { p: "Rishav", h: null, a: null }, { p: "Sweastik", h: 2, a: 0 }
  ],
  "Belgium vs. Egypt": [
    { p: "Amit", h: 2, a: 1 }, { p: "Barun", h: null, a: null }, { p: "Prashanna", h: null, a: null }, { p: "Rishav", h: null, a: null }, { p: "Sweastik", h: null, a: null }
  ],
  "Spain vs. Uruguay": [
    { p: "Amit", h: null, a: null }, { p: "Barun", h: null, a: null }, { p: "Prashanna", h: null, a: null }, { p: "Rishav", h: null, a: null }, { p: "Sweastik", h: null, a: null }
  ],
  "Qatar vs. Switzerland": [
    { p: "Amit", h: null, a: null }, { p: "Barun", h: null, a: null }, { p: "Prashanna", h: null, a: null }, { p: "Rishav", h: null, a: null }, { p: "Sweastik", h: null, a: null }
  ],
  "Côte d'Ivoire vs. Ecuador": [
    { p: "Amit", h: null, a: null }, { p: "Barun", h: null, a: null }, { p: "Prashanna", h: null, a: null }, { p: "Rishav", h: null, a: null }, { p: "Sweastik", h: null, a: null }
  ],
  "France vs. Senegal": [
    { p: "Amit", h: null, a: null }, { p: "Barun", h: null, a: null }, { p: "Prashanna", h: null, a: null }, { p: "Rishav", h: null, a: null }, { p: "Sweastik", h: null, a: null }
  ],
  "Argentina vs. Algeria": [
    { p: "Amit", h: null, a: null }, { p: "Barun", h: 0, a: 5 }, { p: "Prashanna", h: null, a: null }, { p: "Rishav", h: null, a: null }, { p: "Sweastik", h: null, a: null }
  ],
  "Haiti vs. Scotland": [
    { p: "Amit", h: null, a: null }, { p: "Barun", h: null, a: null }, { p: "Prashanna", h: null, a: null }, { p: "Rishav", h: null, a: null }, { p: "Sweastik", h: null, a: null }
  ],
  "Sweden vs. Tunisia": [
    { p: "Amit", h: null, a: null }, { p: "Barun", h: null, a: null }, { p: "Prashanna", h: null, a: null }, { p: "Rishav", h: null, a: null }, { p: "Sweastik", h: null, a: null }
  ],
  "Portugal vs. Colombia": [
    { p: "Amit", h: null, a: null }, { p: "Barun", h: null, a: null }, { p: "Prashanna", h: null, a: null }, { p: "Rishav", h: null, a: null }, { p: "Sweastik", h: null, a: null }
  ],
  "England vs. Croatia": [
    { p: "Amit", h: null, a: null }, { p: "Barun", h: null, a: null }, { p: "Prashanna", h: null, a: null }, { p: "Rishav", h: null, a: null }, { p: "Sweastik", h: null, a: null }
  ],
  "IR Iran vs. New Zealand": [
    { p: "Amit", h: null, a: null }, { p: "Barun", h: null, a: null }, { p: "Prashanna", h: null, a: null }, { p: "Rishav", h: null, a: null }, { p: "Sweastik", h: null, a: null }
  ],
  "Saudi Arabia vs. Cabo Verde": [
    { p: "Amit", h: null, a: null }, { p: "Barun", h: null, a: null }, { p: "Prashanna", h: null, a: null }, { p: "Rishav", h: null, a: null }, { p: "Sweastik", h: null, a: null }
  ],
  "Norway vs. Iraq": [
    { p: "Amit", h: null, a: null }, { p: "Barun", h: null, a: null }, { p: "Prashanna", h: null, a: null }, { p: "Rishav", h: null, a: null }, { p: "Sweastik", h: null, a: null }
  ],
  "Austria vs. Jordan": [
    { p: "Amit", h: null, a: null }, { p: "Barun", h: null, a: null }, { p: "Prashanna", h: null, a: null }, { p: "Rishav", h: null, a: null }, { p: "Sweastik", h: null, a: null }
  ],
  "Uzbekistan vs. Congo DR": [
    { p: "Amit", h: null, a: null }, { p: "Barun", h: null, a: null }, { p: "Prashanna", h: null, a: null }, { p: "Rishav", h: null, a: null }, { p: "Sweastik", h: null, a: null }
  ],
  "Ghana vs. Panama": [
    { p: "Amit", h: null, a: null }, { p: "Barun", h: null, a: null }, { p: "Prashanna", h: null, a: null }, { p: "Rishav", h: null, a: null }, { p: "Sweastik", h: null, a: null }
  ]
};

// Build final MATCHES array with predictions
const MATCHES = RAW_MATCHES.map(m => {
  const matchup = `${m.home_team} vs. ${m.away_team}`;
  const preds = ORIGINAL_PREDS_MAP[matchup] 
    ? ORIGINAL_PREDS_MAP[matchup].map(pred => ({ ...pred }))
    : PLAYERS.map(p => ({ p: p.name, h: null, a: null }));
  
  const [scoreHomeStr, scoreAwayStr] = m.score.split(' - ');
  const rawHome = parseInt(scoreHomeStr, 10);
  const rawAway = parseInt(scoreAwayStr, 10);
  
  return {
    id: m.match_id,
    date: formatDateForDisplay(m.date_time_pt),
    dateTimeRaw: m.date_time_pt,
    group: m.group,
    matchup: matchup,
    home: m.home_team,
    away: m.away_team,
    stadium: m.stadium,
    homeScoreRaw: rawHome,
    awayScoreRaw: rawAway,
    homeScore: null,    // will be set at runtime based on current time
    awayScore: null,
    preds: preds
  };
});

// Make data available globally
window.PLAYERS = PLAYERS;
window.MATCHES = MATCHES;

console.log(`Data loaded: ${MATCHES.length} matches, ${PLAYERS.length} players`); // debug