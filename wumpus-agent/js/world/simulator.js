// simulator.js
// EXTRA: a local copy of the server rules (game.go), with a seeded random generator.
//
// Only our team has the server source code, so the main results use the shared
// server. This simulator is used for the extra experiments: every agent can play
// exactly the same worlds (same seeds), and the true map can be shown or used by
// the oracle to compute the best possible score.
//
// It has the same methods as RemoteServer: newGame() and action(gameId, action).

import { GRID_SIZE, EAST, NORTH, WEST, SOUTH, neighbors } from "../geometry.js";

export const PIT_PROB = 0.2;

// Mulberry32: a small, well known 32-bit pseudo random generator. The same seed
// always produces the same sequence of numbers in [0, 1).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Builds a world exactly like newGame() in game.go.
export function generateWorld(random) {
  const randInt = (n) => Math.floor(random() * n);
  // randPos: random square that is not (0,0) and not (ex, ey).
  const randPos = (ex, ey) => {
    for (;;) {
      const x = randInt(GRID_SIZE);
      const y = randInt(GRID_SIZE);
      if ((x !== 0 || y !== 0) && (x !== ex || y !== ey)) return { x, y };
    }
  };

  const squares = [];
  for (let x = 0; x < GRID_SIZE; x++) {
    squares.push([]);
    for (let y = 0; y < GRID_SIZE; y++) {
      squares[x].push({ pit: false, wumpus: false, gold: false, stench: false, breeze: false });
    }
  }
  const w = randPos(0, 0);
  squares[w.x][w.y].wumpus = true;
  const g = randPos(w.x, w.y);
  squares[g.x][g.y].gold = true;

  for (let x = 0; x < GRID_SIZE; x++) {
    for (let y = 0; y < GRID_SIZE; y++) {
      if ((x === 0 && y === 0) || (x === w.x && y === w.y) || (x === g.x && y === g.y)) continue;
      if (random() < PIT_PROB) squares[x][y].pit = true;
    }
  }
  for (let x = 0; x < GRID_SIZE; x++) {
    for (let y = 0; y < GRID_SIZE; y++) {
      for (const n of neighbors(x, y)) {
        if (squares[x][y].wumpus) squares[n.x][n.y].stench = true;
        if (squares[x][y].pit) squares[n.x][n.y].breeze = true;
      }
    }
  }
  return { squares, wumpus: w, gold: g };
}

// One game, with the same rules as GameState in game.go.
class SimulatedGame {
  constructor(world) {
    this.world = world;
    this.agent = { x: 0, y: 0, dir: EAST, hasArrow: true, hasGold: false };
    this.score = 0;
    this.gameOver = false;
    this.wumpusAlive = true;
    this.lastBump = false;
    this.lastScream = false;
  }

  square(x, y) {
    return this.world.squares[x][y];
  }

  processAction(action) {
    if (this.gameOver) return;
    this.lastBump = false;
    this.lastScream = false;
    this.score -= 1;
    const a = this.agent;
    switch (action) {
      case "Forward": this.moveForward(); break;
      case "TurnLeft": a.dir = (a.dir + 1) % 4; break;
      case "TurnRight": a.dir = (a.dir + 3) % 4; break;
      case "Grab":
        if (this.square(a.x, a.y).gold) {
          a.hasGold = true;
          this.square(a.x, a.y).gold = false;
        }
        break;
      case "Shoot":
        if (a.hasArrow) {
          a.hasArrow = false;
          this.score -= 10;
          this.shootArrow();
        }
        break;
      case "Climb":
        if (a.x === 0 && a.y === 0) {
          this.gameOver = true;
          if (a.hasGold) this.score += 1000;
        }
        break;
      default:
        break; // unknown actions only cost one point, as in the server
    }
    if (!this.gameOver) this.checkHazards();
  }

  moveForward() {
    const a = this.agent;
    let { x, y } = a;
    if (a.dir === EAST) x++;
    else if (a.dir === NORTH) y++;
    else if (a.dir === WEST) x--;
    else if (a.dir === SOUTH) y--;
    if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE) this.lastBump = true;
    else { a.x = x; a.y = y; }
  }

  // Same loops as shootArrow() in game.go: they start at the agent square.
  shootArrow() {
    const a = this.agent;
    const dx = [1, 0, -1, 0][a.dir];
    const dy = [0, 1, 0, -1][a.dir];
    let x = a.x;
    let y = a.y;
    while (x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE) {
      if (this.square(x, y).wumpus) {
        this.wumpusAlive = false;
        this.square(x, y).wumpus = false;
        this.lastScream = true;
        return;
      }
      x += dx;
      y += dy;
    }
  }

  checkHazards() {
    const sq = this.square(this.agent.x, this.agent.y);
    if (sq.pit || (sq.wumpus && this.wumpusAlive)) {
      this.score -= 1000;
      this.gameOver = true;
    }
  }

  perception() {
    const a = this.agent;
    const sq = this.square(a.x, a.y);
    let message = "";
    if (this.gameOver) {
      if (a.hasGold && a.x === 0 && a.y === 0) message = "You climbed out with the gold! VICTORY!";
      else if (sq.pit || (sq.wumpus && this.wumpusAlive)) message = "You Died. GAME OVER.";
      else message = "You climbed out empty-handed. GAME OVER.";
    }
    return {
      stench: sq.stench || (sq.wumpus && this.wumpusAlive),
      breeze: sq.breeze,
      glitter: sq.gold,
      bump: this.lastBump,
      scream: this.lastScream,
      score: this.score,
      gameOver: this.gameOver,
      message,
    };
  }
}

export class LocalSimulator {
  constructor(seed = 1) {
    this.kind = "local";
    this.nextSeed = seed;
    this.games = new Map();
    this.counter = 0;
  }

  // seed (optional): play a specific world. Without it, seeds go 1, 2, 3, ...
  async newGame(seed) {
    const s = seed ?? this.nextSeed++;
    const world = generateWorld(mulberry32(s));
    const original = JSON.parse(JSON.stringify(world)); // copy before the game changes it
    const gameId = "local-" + s + "-" + ++this.counter;
    this.games.set(gameId, { game: new SimulatedGame(world), original, seed: s });
    const game = this.games.get(gameId).game;
    return { gameId, perception: game.perception() };
  }

  async action(gameId, action) {
    const entry = this.games.get(gameId);
    if (!entry) throw new Error("Server answered 404: Game not found");
    entry.game.processAction(action);
    const p = entry.game.perception();
    if (entry.game.gameOver) this.games.delete(gameId);
    return p;
  }

  // The true world of a game at its start (used to draw the map and by the oracle).
  getOriginalWorld(gameId) {
    const entry = this.games.get(gameId);
    return entry ? entry.original : null;
  }
}
