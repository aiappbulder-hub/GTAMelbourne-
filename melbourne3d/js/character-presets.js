import { PersonRig } from './pedestrians.js';

// Five named Melbourne NPC archetypes using the existing 15-bone PersonRig,
// shared skinned crowd mesh, animation, instancing and LOD pipeline.
export const MELBOURNE_CHARACTER_PRESETS = Object.freeze([
  {
    id: 'melbourne-local', name: 'Melbourne Local', role: 'civilian',
    female: false, scale: 1.01, girth: 0.99, hair: 0.22,
    seed: 11.37, armSwing: 0.92, stride: 1.0
  },
  {
    id: 'street-criminal', name: 'Street Criminal', role: 'criminal',
    female: false, scale: 1.02, girth: 1.13, hair: 0.12,
    seed: 27.91, armSwing: 0.82, stride: 0.98
  },
  {
    id: 'female-local', name: 'Female Local', role: 'civilian',
    female: true, scale: 0.97, girth: 0.96, hair: 1,
    seed: 43.16, armSwing: 0.88, stride: 1.02
  },
  {
    id: 'melbourne-bikie', name: 'Bikie', role: 'gang',
    female: false, scale: 1.03, girth: 1.16, hair: 0.04,
    seed: 59.42, armSwing: 0.72, stride: 0.94
  },
  {
    id: 'victoria-police-officer', name: 'Victoria Police Officer', role: 'police',
    female: true, scale: 0.99, girth: 1.02, hair: 0.08,
    seed: 73.85, armSwing: 0.9, stride: 1.0
  },
  // Ambient Melbourne types (js/city-events.js): outfits are shown with coloured accessories on top of the shared rig
  { id: 'tradie-hivis', name: 'Tradie in Hi-Vis', role: 'civilian', female: false, scale: 1.02, girth: 1.08, hair: 0.1, seed: 81.2, armSwing: 0.9, stride: 1.0 },
  { id: 'office-black', name: 'Office Worker in All Black', role: 'civilian', female: false, scale: 1.0, girth: 0.97, hair: 0.2, seed: 92.7, armSwing: 0.85, stride: 1.05 },
  { id: 'hipster-coffee', name: 'Hipster with Coffee Cup', role: 'civilian', female: false, scale: 1.0, girth: 0.93, hair: 0.45, seed: 103.4, armSwing: 0.7, stride: 0.96 },
  { id: 'uni-student', name: 'Uni Student', role: 'civilian', female: true, scale: 0.98, girth: 0.95, hair: 0.8, seed: 114.9, armSwing: 1.0, stride: 1.04 },
  { id: 'afl-fan', name: 'AFL Fan', role: 'civilian', female: false, scale: 1.01, girth: 1.05, hair: 0.2, seed: 125.3, armSwing: 1.1, stride: 1.02 },
  { id: 'afl-fan-f', name: 'AFL Fan', role: 'civilian', female: true, scale: 0.97, girth: 0.97, hair: 0.9, seed: 136.8, armSwing: 1.1, stride: 1.02 },
  { id: 'lycra-cyclist', name: 'Cyclist in Lycra', role: 'civilian', female: false, scale: 1.02, girth: 0.9, hair: 0.05, seed: 147.1, armSwing: 1.0, stride: 1.0 },
  { id: 'scooter-rider', name: 'E-Scooter Rider', role: 'civilian', female: true, scale: 0.99, girth: 0.94, hair: 0.6, seed: 158.6, armSwing: 0.6, stride: 0.9 },
  { id: 'busker', name: 'Busker', role: 'civilian', female: false, scale: 1.0, girth: 1.0, hair: 0.7, seed: 169.0, armSwing: 0.5, stride: 0.9 }
]);

export function createMelbourneCharacterRig(index) {
  const preset = MELBOURNE_CHARACTER_PRESETS[index];
  if (!preset) throw new RangeError(`Unknown Melbourne character preset: ${index}`);
  const { id, name, role, ...rigOptions } = preset;
  const rig = new PersonRig(rigOptions);
  rig.characterId = id;
  rig.characterName = name;
  rig.characterRole = role;
  return rig;
}

export function getMelbourneCharacterPreset(id) {
  return MELBOURNE_CHARACTER_PRESETS.find((preset) => preset.id === id) || null;
}
