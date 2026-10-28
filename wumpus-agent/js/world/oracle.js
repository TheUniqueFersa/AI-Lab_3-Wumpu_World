// oracle.js
// EXTRA: the best possible score of a world, for an agent that can see the whole map.
// It is an upper bound: no real agent can do better on that world.
//
// Uniform-cost search (Dijkstra, Russell & Norvig 3rd ed., Section 3.4.2) over the states
// (x, y, dir, hasGold, hasArrow, wumpusAlive), with the costs of the server:
// 1 per action and 10 more for Shoot. Moves into a pit or a live wumpus are not allowed.
// Climbing out with the gold gives +1000.

import { GRID_SIZE, DX, DY } from "../geometry.js";

export function optimalScore(world) {
  const sq = world.squares;
  const w = world.wumpus;
  const g = world.gold;
  const start = { x: 0, y: 0, dir: 0, gold: false, arrow: true, alive: true };
  const id = (s) => [s.x, s.y, s.dir, s.gold ? 1 : 0, s.arrow ? 1 : 0, s.alive ? 1 : 0].join(",");

  const dist = new Map([[id(start), 0]]);
  const queue = [{ s: start, cost: 0 }];

  while (queue.length > 0) {
    let best = 0;
    for (let i = 1; i < queue.length; i++) if (queue[i].cost < queue[best].cost) best = i;
    const { s, cost } = queue.splice(best, 1)[0];
    if (cost > dist.get(id(s))) continue;

    // Goal: climb out at (0,0) with the gold. The Climb action costs 1.
    if (s.gold && s.x === 0 && s.y === 0) {
      return Math.max(1000 - (cost + 1), -1);
    }

    for (const [next, c] of successors(s)) {
      const nc = cost + c;
      const k = id(next);
      if (!dist.has(k) || nc < dist.get(k)) {
        dist.set(k, nc);
        queue.push({ s: next, cost: nc });
      }
    }
  }
  // The gold cannot be reached safely: the best is to climb out at once (-1).
  return -1;

  function successors(s) {
    const result = [];
    result.push([{ ...s, dir: (s.dir + 1) % 4 }, 1]);
    result.push([{ ...s, dir: (s.dir + 3) % 4 }, 1]);
    const nx = s.x + DX[s.dir];
    const ny = s.y + DY[s.dir];
    if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE) {
      const deadly = sq[nx][ny].pit || (s.alive && nx === w.x && ny === w.y);
      if (!deadly) result.push([{ ...s, x: nx, y: ny }, 1]);
    }
    if (!s.gold && s.x === g.x && s.y === g.y) result.push([{ ...s, gold: true }, 1]);
    if (s.arrow) {
      // The arrow kills the wumpus if it is anywhere in the line of fire.
      let hit = false;
      let x = s.x;
      let y = s.y;
      while (x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE) {
        if (s.alive && x === w.x && y === w.y) hit = true;
        x += DX[s.dir];
        y += DY[s.dir];
      }
      result.push([{ ...s, arrow: false, alive: s.alive && !hit }, 11]);
    }
    return result;
  }
}
