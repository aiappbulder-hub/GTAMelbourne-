// Melbourne's mapped trees (NYT1 data, js/melbourne-tree-geodata.js), less those under a freeway's open deck lower than a
// tree or in its cutting (js/freeway-footprint.js), whose crowns would poke through it.
import { freewayClearance } from './freeway-footprint.js';
const { REAL_TREES: ALL } = await import('./melbourne-tree-geodata.js');
const keep = [];
for (let i = 0; i < ALL.length; i += 2) if (freewayClearance(ALL[i], ALL[i + 1], 3) > 14) keep.push(ALL[i], ALL[i + 1]);
export const REAL_TREES = new Float32Array(keep);
