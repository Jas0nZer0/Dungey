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
// Enemy speed and HP are fixed at spawn from the run time, so later spawns are tougher.
export const ENEMY_SPEED_START = 55; // px/s at 0:00, about a third of the player's speed
export const ENEMY_SPEED_PER_SEC = 0.5; // px/s gained per second of run time
export const ENEMY_SPEED_MAX = 160; // px/s cap, kept under PLAYER_SPEED so the player can always kite
export const ENEMY_HP_START = 3;
export const ENEMY_HP_PER_SEC = 1 / 60; // +1 HP per minute of run time
export const ENEMY_CONTACT_DAMAGE = 1;
export const ENEMY_FLASH = 0.1; // s the sprite stays white after a hit
export const ENEMY_KNOCKBACK = 6; // px pushed back per hit
export const ENEMY_CAP = 50; // max alive at once

// Spawning. Interval shrinks with run time down to the minimum.
export const SPAWN_INTERVAL_START = 1.5; // s
export const SPAWN_INTERVAL_MIN = 0.4; // s
export const SPAWN_INTERVAL_DECAY = 0.01; // s of interval lost per second of run time
export const SPAWN_MIN_DIST = 320; // px from the player, so spawns land off screen-ish
