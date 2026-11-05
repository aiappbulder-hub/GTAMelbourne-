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
  }
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
