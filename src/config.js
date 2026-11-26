// Shared constants.
export const TILE = 32;
export const VIEW_W = 960;
export const VIEW_H = 540;
export const UPDATE_HZ = 60;
export const STEP = 1 / UPDATE_HZ;

// Player tuning (pixels, seconds).
export const PLAYER_SPEED = 180; // max speed, px/s
export const PLAYER_SIZE = 20; // square hitbox side, px
export const PLAYER_ACCEL = 1800; // px/s^2 while a direction is held
export const PLAYER_FRICTION = 2400; // px/s^2 while no direction is held

// Player combat tuning.
export const PLAYER_HP = 5;
export const PLAYER_IFRAMES = 0.8; // s of invulnerability after taking a hit
export const FIRE_INTERVAL = 0.3; // s between shots; the standard weapon fires automatically
export const BULLET_SPEED = 520; // px/s
export const BULLET_RADIUS = 3; // px
export const BULLET_LIFE = 1.2; // s
export const BULLET_DAMAGE = 1;

// Chaser enemy tuning.
export const ENEMY_SIZE = 20; // square hitbox side, px
// Enemy speed, HP, spawn rate and cap come from the difficulty director (difficulty.config.js).
export const ENEMY_CONTACT_DAMAGE = 1;
export const ENEMY_FLASH = 0.1; // s the sprite stays white after a hit
export const ENEMY_KNOCKBACK = 6; // px pushed back per hit

// Spawning.
export const SPAWN_MIN_DIST = 320; // px from the player, so spawns land off screen-ish
