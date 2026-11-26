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
