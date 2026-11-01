// Single source of truth for motion, shared between JS (`motion` props) and CSS.
// bounce 0 == damping 1.0 (critically damped, no overshoot) — Apple's default for
// anything the user did not flick. Reserve bounce for momentum-driven motion.
export const EASE_SPRING = "cubic-bezier(0.22, 1, 0.36, 1)";

export const SPRING = {
  ui: { type: "spring", bounce: 0, duration: 0.35 } as const,
  sheet: { type: "spring", bounce: 0.2, duration: 0.3 } as const,
  press: { type: "spring", bounce: 0, duration: 0.15 } as const,
  // Repositioning a surface the user released. Apple ships damping 1.0 /
  // response 0.4 for the PiP move, so no overshoot even after a flick.
  move: { type: "spring", bounce: 0, duration: 0.4 } as const,
};

/**
 * Where a released gesture is *heading*, had it kept going — Apple's
 * exponential-decay projection from the *Designing Fluid Interfaces* sample
 * code, not the textbook v²/2a. Flick a short distance, land far.
 */
export function project(from: number, velocity: number, decelerationRate = 0.998) {
  return from + (velocity / 1000) * (decelerationRate / (1 - decelerationRate));
}

/** Where a card's thumbnail sits when it is picked — the start of the hero flight. */
export type HeroRect = { x: number; y: number; w: number; h: number };
export type HeroOrigin = HeroRect | null;
