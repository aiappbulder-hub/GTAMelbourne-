// Which city the engine builds. melbourne3d is GTA Melbourne's engine, so Melbourne is the default; ?nyc builds Slop
// New York's Manhattan, kept as the reference the port is checked against.
export const CITY = typeof location !== 'undefined' && new URLSearchParams(location.search).has('nyc') ? 'nyc' : 'melbourne';
export const IS_MELBOURNE = CITY === 'melbourne';
