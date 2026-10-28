// planner.js
// Route planning with A* search: PLAN-ROUTE and PLAN-SHOT of the hybrid agent.
//
// References:
//   - Russell & Norvig, 3rd ed., Figure 7.20 (p. 270): PLAN-ROUTE(current, goals, allowed).
//   - Russell & Norvig, 3rd ed., Section 3.5.2 (p. 93): A* search, f(n) = g(n) + h(n).
//
// A search state is the agent position plus its orientation: (x, y, dir).
// Actions: Forward, TurnLeft, TurnRight, each with cost 1 (each action costs -1 point).
// The route may only pass through "allowed" squares (squares known to be safe).

import { DX, DY, inside, key, turnLeft, turnRight, GRID_SIZE } from "../geometry.js";

// Returns the list of actions that takes the agent from `start` to any square in
// `goals`, moving only through `allowed` squares, or null if there is no route.
//   start:   { x, y, dir }
//   goals:   array of { x, y }
//   allowed: Set of keys "x,y" (the goal squares are always allowed as the last step)
export function planRoute(start, goals, allowed) {
  if (goals.length === 0) return null;
  const goalKeys = new Set(goals.map((g) => key(g.x, g.y)));
  const goalTest = (s) => goalKeys.has(key(s.x, s.y));
  // Heuristic: Manhattan distance to the closest goal. Every Forward moves one
  // square, so the real cost is never smaller: the heuristic is admissible.
  const heuristic = (s) => Math.min(...goals.map((g) => Math.abs(g.x - s.x) + Math.abs(g.y - s.y)));
  const canEnter = (x, y) => allowed.has(key(x, y)) || goalKeys.has(key(x, y));
  return aStar(start, goalTest, heuristic, canEnter);
}

// PLAN-SHOT: the book does not show this function, only says that it uses
// PLAN-ROUTE to line up a shot (p. 269). Here it plans a route to a square that is
// in the same row or column as one of the targets, facing the target, and then
// adds Shoot. Returns { actions, target, path } or null.
export function planShot(start, targets, allowed) {
  if (targets.length === 0) return null;

  // A pose (x, y, dir) is a good shooting pose if the arrow, flying from (x, y)
  // in direction dir, passes through one of the target squares.
  const targetKeys = new Set(targets.map((t) => key(t.x, t.y)));
  const goalTest = (s) => {
    if (!allowed.has(key(s.x, s.y))) return false;
    return arrowPath(s.x, s.y, s.dir).some((c) => targetKeys.has(key(c.x, c.y)));
  };
  // Heuristic: 0 when in line with a target, 1 otherwise (at least one move or turn
  // is needed). It never overestimates, so A* still finds the cheapest plan.
  const heuristic = (s) => (goalTest(s) ? 0 : 1);
  const canEnter = (x, y) => allowed.has(key(x, y));

  const actions = aStar(start, goalTest, heuristic, canEnter);
  if (actions === null) return null;

  // Simulate the plan to know from where the arrow is shot.
  const pose = simulate(start, actions);
  const path = arrowPath(pose.x, pose.y, pose.dir);
  const target = path.find((c) => targetKeys.has(key(c.x, c.y)));
  return { actions: actions.concat(["Shoot"]), target, path };
}

// Squares the arrow flies over when shot from (x, y) in direction dir.
// In the server (game.go, shootArrow) the arrow flies in a straight line up to the wall.
export function arrowPath(x, y, dir) {
  const cells = [];
  let cx = x + DX[dir];
  let cy = y + DY[dir];
  while (inside(cx, cy)) {
    cells.push({ x: cx, y: cy });
    cx += DX[dir];
    cy += DY[dir];
  }
  return cells;
}

// Applies a list of movement actions to a pose and returns the final pose.
export function simulate(pose, actions) {
  let { x, y, dir } = pose;
  for (const a of actions) {
    if (a === "TurnLeft") dir = turnLeft(dir);
    else if (a === "TurnRight") dir = turnRight(dir);
    else if (a === "Forward") {
      const nx = x + DX[dir];
      const ny = y + DY[dir];
      if (inside(nx, ny)) {
        x = nx;
        y = ny;
      }
    }
  }
  return { x, y, dir };
}

// Generic A* graph search over poses (Section 3.5.2).
// Returns the action list of a cheapest path, or null if the goal cannot be reached.
function aStar(start, goalTest, heuristic, canEnter) {
  const stateKey = (s) => s.x + "," + s.y + "," + s.dir;

  // The frontier is a simple array; we take the node with the smallest f = g + h.
  // With at most 4 x 4 x 4 = 64 states this is fast enough and easy to read.
  const frontier = [{ state: start, g: 0, f: heuristic(start), actions: [] }];
  const bestCost = new Map([[stateKey(start), 0]]);
  const explored = new Set();

  while (frontier.length > 0) {
    // Pop the node with the lowest f value.
    let best = 0;
    for (let i = 1; i < frontier.length; i++) {
      if (frontier[i].f < frontier[best].f) best = i;
    }
    const node = frontier.splice(best, 1)[0];
    const k = stateKey(node.state);

    if (goalTest(node.state)) {
      return node.actions;
    }
    if (explored.has(k)) continue;
    explored.add(k);

    for (const [action, next] of successors(node.state, canEnter)) {
      const nk = stateKey(next);
      const g = node.g + 1;
      if (explored.has(nk)) continue;
      if (bestCost.has(nk) && bestCost.get(nk) <= g) continue;
      bestCost.set(nk, g);
      frontier.push({ state: next, g, f: g + heuristic(next), actions: node.actions.concat([action]) });
    }
  }
  return null;
}

// The three movement actions and the pose each one produces.
function successors(s, canEnter) {
  const result = [
    ["TurnLeft", { x: s.x, y: s.y, dir: turnLeft(s.dir) }],
    ["TurnRight", { x: s.x, y: s.y, dir: turnRight(s.dir) }],
  ];
  const nx = s.x + DX[s.dir];
  const ny = s.y + DY[s.dir];
  if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE && canEnter(nx, ny)) {
    result.push(["Forward", { x: nx, y: ny, dir: s.dir }]);
  }
  return result;
}
