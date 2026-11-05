// The city's surveyed buildings (NYB1 data): Manhattan's or Melbourne's.
import { IS_MELBOURNE } from './city.js';
export const { REAL_BUILDINGS } = IS_MELBOURNE ? await import('./melbourne-building-geodata.js') : await import('./building-geodata.js');
