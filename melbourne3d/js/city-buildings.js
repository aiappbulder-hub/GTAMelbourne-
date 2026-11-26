// Melbourne's surveyed buildings (NYB1 data, js/melbourne-building-geodata.js), less those that would stand through a
// freeway's open deck, on its road or in its cutting (js/freeway-footprint.js): within 1.5 m of a way's edge (its barrier
// and a margin) a building is kept only under a viaduct, with its roof 0.5 m clear of the deck's underside.
import { polygonFreewayClearance } from './freeway-footprint.js';
const { REAL_BUILDINGS: ALL } = await import('./melbourne-building-geodata.js');
export const REAL_BUILDINGS = ALL.filter((b) => !b.polygons.some((p) => polygonFreewayClearance(p.outer, 1.5) < b.height + 0.5));
