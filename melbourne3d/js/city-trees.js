// The city's mapped trees (NYT1 data): Manhattan's or Melbourne's.
import { IS_MELBOURNE } from './city.js';
export const { REAL_TREES } = IS_MELBOURNE ? await import('./melbourne-tree-geodata.js') : await import('./tree-geodata.js');
