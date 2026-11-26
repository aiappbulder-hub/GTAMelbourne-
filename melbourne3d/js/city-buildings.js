// Melbourne's surveyed buildings (NYB1 data, js/melbourne-building-geodata.js), less those that would stand through a
// freeway's open deck or in its cutting (js/freeway-footprint.js): a building is kept under a viaduct only if its roof
// stays 0.5 m clear of the deck's underside.
import { polygonFreewayClearance } from './freeway-footprint.js';
const { REAL_BUILDINGS: ALL } = await import('./melbourne-building-geodata.js');
export const REAL_BUILDINGS = ALL.filter((b) => !b.polygons.some((p) => polygonFreewayClearance(p.outer, 0.3) < b.height + 0.5));
