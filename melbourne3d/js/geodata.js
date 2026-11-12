// Melbourne's geography (js/melbourne-geodata.js) for the modules that read GEO directly. It carries no New York features, so
// the keys the engine's generic modules still look for are filled with empty values of the same shape.
const { GEO: RAW } = await import('./melbourne-geodata.js');
const FAR = { minX: 1e7, maxX: 1e7 + 1, minZ: 1e7, maxZ: 1e7 + 1 };
export const GEO = {
  manhattan: RAW.bounds, upperManhattan: [], innerShore: RAW.bounds, islands: {},
  boroughs: { brooklyn: [], queens: [], bronx: [], statenIsland: [], newJersey: [[]] },
  streets: [], avenues: [], broadway: [], plazas: [], piers: [], bridges: {}, points: {},
  centralPark: { bounds: FAR, outline: [], water: [], lawns: [], drives: [], paths: [], sites: [] },
  ...RAW,
  frame: { cutZ: RAW.frame.minZ, strip: 0, ...RAW.frame }
};
