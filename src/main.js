// Dungey: minimal canvas game loop. Arrow keys or WASD move the player.
const TILE = 32;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const map = [
  '####################',
  '#..................#',
  '#..####....####....#',
  '#..#..........#....#',
  '#..#..........#....#',
  '#..####....####....#',
  '#..................#',
  '#....#........#....#',
  '#....#........#....#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '####################',
].map((row) => row.split(''));

const player = { x: 1, y: 1 };
const keys = new Set();

const moves = {
  ArrowUp: [0, -1], w: [0, -1],
  ArrowDown: [0, 1], s: [0, 1],
  ArrowLeft: [-1, 0], a: [-1, 0],
  ArrowRight: [1, 0], d: [1, 0],
};

window.addEventListener('keydown', (e) => {
  if (!(e.key in moves) || keys.has(e.key)) return;
  keys.add(e.key);
  e.preventDefault();
  const [dx, dy] = moves[e.key];
  const nx = player.x + dx;
  const ny = player.y + dy;
  if (map[ny]?.[nx] === '.') {
    player.x = nx;
    player.y = ny;
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.key));

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  map.forEach((row, y) => row.forEach((cell, x) => {
    ctx.fillStyle = cell === '#' ? '#3b3b4f' : '#1b1b26';
    ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
  }));
  ctx.fillStyle = '#f4c542';
  ctx.fillRect(player.x * TILE + 6, player.y * TILE + 6, TILE - 12, TILE - 12);
}

function frame() {
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
