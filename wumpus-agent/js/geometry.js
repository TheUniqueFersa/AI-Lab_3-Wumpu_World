// geometry.js
// Shared constants and helpers for the 4x4 grid.
//
// Coordinates follow the server (game.go): x grows to the East, y grows to the North,
// and the agent starts at (0, 0) facing East.
// The book and the course slides number squares from 1, so the server cell (0, 0)
// is the book square [1,1]. Use label() whenever a cell is shown to a person.

export const GRID_SIZE = 4;

// Directions use the same numbers as the server: East = 0, North = 1, West = 2, South = 3.
export const EAST = 0;
export const NORTH = 1;
export const WEST = 2;
export const SOUTH = 3;
export const DIRECTION_NAMES = ["East", "North", "West", "South"];

// Movement vector for each direction, indexed by direction number.
export const DX = [1, 0, -1, 0];
export const DY = [0, 1, 0, -1];

// TurnLeft is counterclockwise (East -> North), TurnRight is clockwise (East -> South).
export function turnLeft(dir) {
  return (dir + 1) % 4;
}

export function turnRight(dir) {
  return (dir + 3) % 4;
}

export function inside(x, y) {
  return x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE;
}

// A string key so cells can be stored in a Set or Map, for example "2,1".
export function key(x, y) {
  return x + "," + y;
}

export function parseKey(k) {
  const [x, y] = k.split(",").map(Number);
  return { x, y };
}

// Human label using the book numbering, for example (0, 0) -> "[1,1]".
export function label(x, y) {
  return "[" + (x + 1) + "," + (y + 1) + "]";
}

// The up to four squares that share a side with (x, y).
export function neighbors(x, y) {
  const result = [];
  for (let d = 0; d < 4; d++) {
    const nx = x + DX[d];
    const ny = y + DY[d];
    if (inside(nx, ny)) {
      result.push({ x: nx, y: ny });
    }
  }
  return result;
}

export function allCells() {
  const cells = [];
  for (let x = 0; x < GRID_SIZE; x++) {
    for (let y = 0; y < GRID_SIZE; y++) {
      cells.push({ x, y });
    }
  }
  return cells;
}
