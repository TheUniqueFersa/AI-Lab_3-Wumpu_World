# Wumpus World with DPLL

AI course, Lab 3. A knowledge-based agent that plays the Wumpus World against the class
server and decides each move with the DPLL algorithm.

Main source: S. Russell and P. Norvig, *Artificial Intelligence: A Modern Approach*, 3rd ed.,
Chapter 7 (and Section 13.6 for agent C).

## What is in this folder

```
index.html, css/            Web page (play a game step by step, run experiments)
js/geometry.js              Grid constants: directions, neighbors, labels like [1,1]
js/logic/dpll.js            DPLL algorithm (Figure 7.17, p. 261, and the course slides)
js/logic/kb.js              Knowledge base with TELL and ASK (entailment by refutation)
js/logic/wumpus-kb.js       Wumpus axioms in CNF (Section 7.4.3 and 7.7.1)
js/agent/planner.js         A* route planning: PLAN-ROUTE and PLAN-SHOT (Figure 7.20)
js/agent/probability.js     Risk of each frontier square (Section 13.6), used by agent C
js/agent/agents.js          Agents A, B and C
js/world/remote.js          Client of the server API (/game/new, /game/{id}/action)
js/world/simulator.js       EXTRA: local copy of the server rules, with seeds
js/world/oracle.js          EXTRA: best possible score of a world (sees the whole map)
js/experiments/runner.js    Plays many games, computes statistics, writes CSV
tests/unit-tests.mjs        Checks of DPLL, the KB, the planner and the agents
tests/run-experiments.mjs   Runs the comparison from the terminal
server-patch/               CORS change for the Go server (needed by the web page)
```

## The three agents

| Agent | Idea | Book |
|---|---|---|
| A | Random moves, grabs the gold if it sees it. Lower bound, no reasoning. | |
| B | Hybrid agent. Enters only squares that DPLL proves safe. If none is left, it shoots when that can open a square; otherwise it returns to [1,1] and climbs. Never dies. | Figure 7.20 |
| C | Same as B, but when nothing is safe it computes the probability of death of each frontier square and enters the safest one if the risk is below a threshold (35% by default). | Figure 7.20 + Section 13.6 |

How agents B and C decide, in order:

1. Glitter: Grab, plan the way back to [1,1], Climb.
2. Follow the current plan, if there is one.
3. TELL the percepts of a new square; ASK the KB which squares are proven safe
   (`KB |= ¬Px,y` and `KB |= ¬Wx,y`, each one a DPLL refutation).
4. Plan a route (A*) to the closest safe square not visited yet.
5. If none: shoot toward a square that is proven pit-free but may hold the wumpus.
6. Agent C only: enter the frontier square with the lowest risk, if it is below the threshold.
7. Otherwise: return to [1,1] and climb out.

## Run it on your computer

The page uses JavaScript modules, so it must be opened through a web server, not by
double-clicking `index.html`:

```bash
cd wumpus-agent
python -m http.server 8000
# open http://localhost:8000
```

Keyboard shortcuts on the Play tab: `N` new game, `Space` one step, `P` play or pause.

## Choosing the server

The addresses are written in `js/config.js` (edit them there, nowhere else):

| Option in the World menu | Address | Use |
|---|---|---|
| Class server (Render) | `https://wumpus-world-cipl.onrender.com` | **Main tests of the report** |
| Our Go server on this computer | `http://localhost:8080` | Live demo, debugging |
| Local simulator (extra) | runs inside the page | Extra experiments only |

The terminal script uses the same names: `--server render` (default) or `--server localhost`.

### Run our Go server on localhost

`server-patch/server.go` is the original `server.go` plus a small `withCORS` function, which
lets a web page on another address (another port counts too) read the answers. It does not
change any game rule. In a folder with `game.go`, `go.mod`, `README.md` and this `server.go`:

```bash
go build -o wumpus-server .   # compile (Go 1.24 or newer)
./wumpus-server               # listens on http://localhost:8080 until Ctrl+C
```

The port is written in `server.go` (`":8080"`). If you change it, also change the
`localhost` address in `js/config.js`.

### Render and CORS

The browser only lets the page read the Render server if Render also sends the CORS
headers. Until `server-patch/server.go` is deployed there, use Render from the terminal
script (`node tests/run-experiments.mjs`, which is not affected by CORS) and use
localhost for the page.

## Publish the page on GitHub Pages

1. Create a repository (for example `wumpus-agent`) and push this folder to it.
2. In the repository: Settings, Pages, Source "Deploy from a branch", branch `main`, folder `/ (root)`.
3. After a minute the page is at `https://<your-user>.github.io/wumpus-agent/`.

## Tests and experiments

Node 18 or newer:

```bash
node tests/unit-tests.mjs

# MAIN experiment, on the class server (same conditions as every other team):
node tests/run-experiments.mjs --server render --games 300 --agents A,B,C --thresholds 0.2,0.35,0.5 --delay 20 --out results/server.csv

# EXTRA, local simulator: every configuration plays the same 1000 worlds, includes the
# best possible score and the version of B and C that uses the rules from game.go:
node tests/run-experiments.mjs --local --games 1000 --thresholds 0.2,0.35,0.5 --code-rules --out results/local.csv
```

Each CSV row is one game: agent, threshold, score, outcome (`gold`, `empty`, `death`),
actions, arrow used, breeze and stench in [1,1], DPLL calls, thinking time and, with
the simulator only, the best possible score.

The same experiments can be run from the Experiments tab of the page, which also draws
the charts and lets you download the CSV.

## Public rules and code rules

Main results only use the public rules (README of the server, course slides, book).
The option "rules taken from the server code" adds what only our team knows from
`game.go`: a pit is never in the wumpus square. It is used only in the extra experiments,
to measure how much knowing the code helps.
