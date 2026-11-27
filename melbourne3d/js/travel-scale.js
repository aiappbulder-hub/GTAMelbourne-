// How fast the player's cars cover the map, and how their speed is shown (v37).
// TRAVEL_SCALE: the cars' real m/s (top speed, pull, brakes, grip) are this much above v36, so the city is crossed
// quicker, the way GTA cars cross theirs. DISPLAY_DIV: every km/h shown to the player (speedo, HUD, labels) and the
// engine-note speed are the real speed divided by this, so a taxi still reads about 130 km/h flat out and the
// Clubbie about 280. (v36 cars were 1.4x v35; 1.4 * 1.3 = 1.82, so 1.8.) Internal logic stays in real m/s.
export const TRAVEL_SCALE = 1.3;
export const DISPLAY_DIV = 1.8;
/** Handling for the player's cars, scaled for TRAVEL_SCALE (drag is quadratic in speed, so it falls with the square). */
export function travelDrive(d) {
  const k = TRAVEL_SCALE;
  return { ...d, speed: d.speed * k, reverseSpeed: d.reverseSpeed * k, acceleration: d.acceleration * k,
    powerSpeed: d.powerSpeed * k, brake: d.brake * k, grip: d.grip * k, cornering: d.cornering * k, drag: d.drag / (k * k) };
}
