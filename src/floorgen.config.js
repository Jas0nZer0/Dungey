// Floor generator tuning. Plain data; edit the numbers to change how floors look.
export const FLOOR = {
  // BSP leaves: the map is split until a leaf cannot hold two leaves of this size.
  minLeafW: 18,
  minLeafH: 15,
  stopArea: 700, // a leaf this small or smaller may stop splitting early...
  stopChance: 0.3, // ...with this probability, so room counts vary
  // Rooms sit inside a leaf with a 1-tile margin, so two rooms never touch.
  minRoomW: 8,
  minRoomH: 7,
  maxRoomW: 22,
  maxRoomH: 16,
  corridorWidth: 2, // tiles. 1-wide passages are rejected (enemies snag in them).
  extraLoopChance: 0.2, // chance per candidate extra link between near rooms (makes loops)
  maxLinkGap: 12, // extra links only join rooms whose rects are this close (tiles)
  minExitPath: 120, // spawn to exit must be at least this many tiles of walking
  // Cover. Obstacles keep a 2-tile margin from room walls and from each other, so cover never
  // creates a 1-wide slot or an alcove. Density is the share of room area covered.
  styles: [
    { name: 'open', weight: 0.08, density: 0 },
    { name: 'sparse', weight: 0.3, density: 0.08 },
    { name: 'normal', weight: 0.36, density: 0.14 },
    { name: 'dense', weight: 0.2, density: 0.2 },
  ],
  shapes: [[1, 1], [2, 2], [3, 1], [1, 3], [4, 1], [1, 4], [3, 2], [2, 3], [3, 3], [4, 2], [2, 4], [5, 1], [1, 5], [4, 3], [3, 4]],
  // Quality gate (the measurable proxy for "cover and open fire lanes"). A generated layout
  // that misses it is thrown away and regenerated from the next attempt seed.
  laneMin: 7, // a "fire lane" is this many floor tiles in a straight row or column inside a room
  minLaneShare: 0.75, // at least this share of rooms has a fire lane
  maxOpenShare: 0.25, // at most this share of rooms has no cover at all
  maxClutter: 0.22, // no room may have more than this share of its area as cover
  minRooms: 12,
  maxRooms: 40,
  maxAttempts: 60,
};
