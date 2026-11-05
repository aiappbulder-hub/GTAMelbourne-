// The city's geography (js/nyc-geodata.js or js/melbourne-geodata.js) for the modules that read GEO directly.
// Melbourne's carries no New York features, so those keys are filled with empty values of the same shape.
import { IS_MELBOURNE } from './city.js';

const { GEO: RAW } = IS_MELBOURNE ? await import('./melbourne-geodata.js') : await import('./nyc-geodata.js');
const FAR = { minX: 1e7, maxX: 1e7 + 1, minZ: 1e7, maxZ: 1e7 + 1 };
export const GEO = IS_MELBOURNE ? {
  manhattan: RAW.bounds, upperManhattan: [], innerShore: RAW.bounds, islands: {},
  boroughs: { brooklyn: [], queens: [], bronx: [], statenIsland: [], newJersey: [[]] },
  streets: [], avenues: [], broadway: [], plazas: [], piers: [], bridges: {}, points: {},
  centralPark: { bounds: FAR, outline: [], water: [], lawns: [], drives: [], paths: [], sites: [] },
  ...RAW,
  frame: { cutZ: RAW.frame.minZ, strip: 0, ...RAW.frame }
} : RAW;
