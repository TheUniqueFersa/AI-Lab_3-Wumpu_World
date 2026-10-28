// board.js
// Draws the 4x4 cave: what the agent knows about each square, the percepts it
// felt there and, only with the local simulator, the real map.

import { GRID_SIZE, key, label, neighbors } from "../geometry.js";

const ROTATION = [0, -90, 180, 90]; // degrees for East, North, West, South

export class Board {
  constructor(element) {
    this.element = element;
    this.cells = new Map();
    element.innerHTML = "";

    // Rows are drawn from the top (y = 3) to the bottom (y = 0), like the book figures.
    for (let y = GRID_SIZE - 1; y >= 0; y--) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const cell = document.createElement("div");
        cell.className = "cell";
        cell.innerHTML =
          '<div class="truth"></div><div class="notes"></div>' +
          '<div class="percepts"></div><span class="coord">' + label(x, y) + "</span>";
        element.appendChild(cell);
        this.cells.set(key(x, y), cell);
      }
    }

    this.agentEl = document.createElement("div");
    this.agentEl.className = "agent";
    this.agentEl.innerHTML = '<div class="glow"></div><svg viewBox="0 0 24 24"><use href="#g-agent"/></svg>';
    element.appendChild(this.agentEl);
  }

  // agent:   the agent object (RandomAgent or LogicAgent)
  // world:   real world from the simulator, or null
  // dead:    true if the game ended with the agent dead
  render(agent, world, dead) {
    const isLogic = agent && agent.kb !== undefined;
    const safe = isLogic ? agent.safeSquares() : new Set();

    for (let x = 0; x < GRID_SIZE; x++) {
      for (let y = 0; y < GRID_SIZE; y++) {
        const k = key(x, y);
        const cell = this.cells.get(k);
        const visited = agent ? agent.visited.has(k) : false;
        const notes = [];
        let deadly = false;

        if (agent) {
          if (visited) notes.push(tag("V", "tag-v"));
          if (isLogic && !visited) {
            if (safe.has(k)) notes.push(tag("OK", "tag-ok"));
            if (agent.pit.has(k)) { notes.push(tag("P!", "tag-p")); deadly = true; }
            if (agent.wumpusAt && key(agent.wumpusAt.x, agent.wumpusAt.y) === k) {
              if (agent.wumpusAlive) { notes.push(tag("W!", "tag-w")); deadly = true; }
              else notes.push(tag("W", "tag-dead"));
            }
            if (!safe.has(k) && !agent.pit.has(k) && !agent.noPit.has(k) && nearPercept(agent, x, y, "breeze")) {
              notes.push(tag("P?", "tag-pq"));
            }
            if (agent.wumpusAlive && !safe.has(k) && agent.wumpusAt === null && !agent.noWumpus.has(k) &&
                nearPercept(agent, x, y, "stench")) {
              notes.push(tag("W?", "tag-wq"));
            }
            if (agent.risks && agent.risks.has(k) && !safe.has(k) && !deadly) {
              notes.push(tag(Math.round(100 * agent.risks.get(k)) + "%", "tag-risk"));
            }
          }
        }
        cell.classList.toggle("visited", visited);
        cell.classList.toggle("safe", isLogic && !visited && safe.has(k));
        cell.classList.toggle("deadly", deadly);
        cell.querySelector(".notes").innerHTML = notes.join("");

        // Percepts felt in this square (only known for visited squares).
        const p = agent ? agent.percepts.get(k) : null;
        let icons = "";
        if (p && visited) {
          if (p.breeze) icons += glyph("g-breeze", "p-breeze", "Breeze");
          if (p.stench) icons += glyph("g-stench", "p-stench", "Stench");
          if (p.glitter && !agent.hasGold) icons += glyph("g-glitter", "p-glitter", "Glitter");
        }
        cell.querySelector(".percepts").innerHTML = icons;

        // Real map, only when the simulator gives it and the user asked for it.
        let truth = "";
        if (world) {
          const sq = world.squares[x][y];
          if (sq.pit) truth += glyph("g-pit", "t-pit", "Pit");
          if (sq.wumpus) truth += glyph("g-wumpus", "t-wumpus", "Wumpus");
          if (sq.gold && !(agent && agent.hasGold)) truth += glyph("g-gold", "t-gold", "Gold");
        }
        cell.querySelector(".truth").innerHTML = truth;
      }
    }

    // Move and rotate the agent.
    if (agent) {
      const row = GRID_SIZE - 1 - agent.y;
      this.agentEl.hidden = false;
      this.agentEl.style.transform =
        "translate(calc(" + agent.x + " * (100% + var(--gap))), calc(" + row + " * (100% + var(--gap))))";
      this.agentEl.querySelector("svg").style.transform = "rotate(" + ROTATION[agent.dir] + "deg)";
      this.agentEl.classList.toggle("dead", Boolean(dead));
    } else {
      this.agentEl.hidden = true;
    }
  }

  // Draws the flight of the arrow for a moment.
  showShot(agent, path) {
    if (!path || path.length === 0) return;
    const from = this.center(agent.x, agent.y);
    const last = path[path.length - 1];
    const to = this.center(last.x, last.y);
    const line = document.createElement("div");
    line.className = "shot";
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    line.style.left = from.x + "px";
    line.style.top = from.y + "px";
    line.style.width = Math.hypot(dx, dy) + "px";
    line.style.transform = "rotate(" + (Math.atan2(dy, dx) * 180) / Math.PI + "deg)";
    this.element.appendChild(line);
    setTimeout(() => line.remove(), 1700);
  }

  center(x, y) {
    const cell = this.cells.get(key(x, y));
    return { x: cell.offsetLeft + cell.offsetWidth / 2, y: cell.offsetTop + cell.offsetHeight / 2 };
  }
}

function tag(text, cls) {
  return '<b class="tag ' + cls + '">' + text + "</b>";
}

function glyph(id, cls, title) {
  return '<svg class="' + cls + '" viewBox="0 0 24 24" role="img" aria-label="' + title + '"><use href="#' + id + '"/></svg>';
}

// True if a visited neighbor of (x, y) felt the given percept.
function nearPercept(agent, x, y, name) {
  return neighbors(x, y).some((n) => {
    const p = agent.percepts.get(key(n.x, n.y));
    return p && agent.visited.has(key(n.x, n.y)) && p[name];
  });
}
