// app.js
// Connects the interface with the agents and the server.

import { LocalSimulator } from "../world/simulator.js";
import { createServer, fillServerSelect } from "../world/servers.js";
import { SERVERS, DEFAULT_SERVER, SIMULATOR } from "../config.js";
import { createAgent } from "../agent/agents.js";
import { DIRECTION_NAMES } from "../geometry.js";
import { Board } from "./board.js";
import { setupExperiments } from "./experiments.js";

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------
// Saved settings (only a convenience: the page works the same without them)
// ---------------------------------------------------------------------------
function loadSetting(name, fallback) {
  try {
    const value = localStorage.getItem("wumpus." + name);
    return value === null ? fallback : value;
  } catch {
    return fallback;
  }
}
function saveSetting(name, value) {
  try {
    localStorage.setItem("wumpus." + name, String(value));
  } catch {
    // Storage may be blocked; nothing else depends on it.
  }
}

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------
const board = new Board($("board"));
const simulator = new LocalSimulator();
const game = {
  server: null,
  agent: null,
  gameId: null,
  percept: null,
  world: null,       // real world, only with the simulator
  actions: 0,
  lastAction: "None",
  over: false,
  dead: false,
  playing: false,
  busy: false,
  shownLog: 0,
};

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------
fillServerSelect($("backend"));
$("backend").value = loadSetting("backend", DEFAULT_SERVER);
if (!$("backend").value) $("backend").value = DEFAULT_SERVER; // saved option no longer exists
$("agent").value = loadSetting("agent", "C");
$("threshold").value = loadSetting("threshold", "0.35");
$("speed").value = loadSetting("speed", "600");

function updateControls() {
  const local = $("backend").value === SIMULATOR;
  const entry = SERVERS[$("backend").value];
  $("server-address").textContent = entry ? "Address: " + entry.url + " (edit it in js/config.js)" : "Runs inside this page.";
  $("field-seed").hidden = !local;
  $("field-reveal").hidden = !local;
  $("field-threshold").hidden = $("agent").value !== "C";
  $("threshold-out").textContent = Math.round(100 * Number($("threshold").value)) + "%";
  $("btn-step").disabled = !game.agent || game.over || game.playing || game.busy;
  $("btn-play").disabled = !game.agent || game.over;
  $("btn-play").textContent = game.playing ? "Pause" : "Play";
}

for (const id of ["backend", "agent", "threshold", "speed"]) {
  $(id).addEventListener("input", () => {
    saveSetting(id, $(id).value);
    updateControls();
  });
}
$("reveal").addEventListener("change", render);

$("btn-new").addEventListener("click", newGame);
$("btn-step").addEventListener("click", () => step());
$("btn-play").addEventListener("click", togglePlay);

// Keyboard shortcuts for the live demo: N new game, Space step, P play or pause.
document.addEventListener("keydown", (event) => {
  if (event.target.matches("input, select, textarea") || $("play").hidden) return;
  if (event.key === "n") newGame();
  else if (event.key === " ") { event.preventDefault(); step(); }
  else if (event.key === "p") togglePlay();
});

// ---------------------------------------------------------------------------
// Game flow
// ---------------------------------------------------------------------------
async function newGame() {
  game.playing = false;
  showMessage("");
  $("banner").hidden = true;
  const local = $("backend").value === SIMULATOR;
  // The simulator object is kept between games so its seeds keep counting.
  game.server = local ? simulator : createServer($("backend").value);

  try {
    setBusy(true, local ? "Creating a world..." : "Asking the server for a new world...");
    const seed = local ? Number($("seed").value) || 1 : undefined;
    const started = await game.server.newGame(seed);
    game.gameId = started.gameId;
    game.world = local ? simulator.getOriginalWorld(started.gameId) : null;
    game.agent = createAgent($("agent").value, {
      riskThreshold: Number($("threshold").value),
      useCodeRules: $("code-rules").checked,
    });
    game.agent.start(started.perception);
    game.percept = started.perception;
    game.actions = 0;
    game.lastAction = "None";
    game.over = false;
    game.dead = false;
    game.shownLog = 0;
    $("log").innerHTML = "";
    refreshKnowledge();
    setBusy(false, "Game " + shortId(game.gameId) + " started. Press Step or Play.");
    if (local) $("seed").value = seed + 1; // next press gives the next world
  } catch (error) {
    setBusy(false);
    showError(error);
  }
  render();
}

async function step() {
  if (!game.agent || game.over || game.busy) return;
  try {
    game.busy = true;
    updateControls();
    const action = game.agent.nextAction();
    const percept = await game.server.action(game.gameId, action);
    game.agent.observe(action, percept);
    game.percept = percept;
    game.actions++;
    game.lastAction = action;
    if (action === "Shoot" && game.agent.lastShot) board.showShot(game.agent, game.agent.lastShot.path);
    if (percept.gameOver) finish(percept);
    refreshKnowledge();
  } catch (error) {
    game.playing = false;
    showError(error);
  } finally {
    game.busy = false;
  }
  render();
}

async function togglePlay() {
  if (!game.agent || game.over) return;
  game.playing = !game.playing;
  updateControls();
  while (game.playing && !game.over) {
    await step();
    await sleep(Number($("speed").value));
  }
  game.playing = false;
  updateControls();
}

function finish(percept) {
  game.over = true;
  game.playing = false;
  game.dead = percept.message.includes("Died");
  const banner = $("banner");
  banner.hidden = false;
  banner.className = "banner " + (percept.message.includes("VICTORY") ? "win" : game.dead ? "lose" : "");
  const text = percept.message.includes("VICTORY") ? "Climbed out with the gold"
    : game.dead ? "The agent died" : "Climbed out without the gold";
  banner.textContent = text + ". Final score " + percept.score;
}

// The logic agent only asks the KB when it needs a new plan. For the picture we
// ask after every step too, so the map always shows everything DPLL can prove.
function refreshKnowledge() {
  if (game.agent && game.agent.kb && !game.over) game.agent.updateKnowledge();
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------
function render() {
  const agent = game.agent;
  const showWorld = game.world && $("reveal").checked && $("backend").value === SIMULATOR;
  board.render(agent, showWorld ? game.world : null, game.dead);

  const p = game.percept || {};
  for (const el of document.querySelectorAll(".sensor")) {
    el.classList.toggle("on", Boolean(p[el.dataset.sensor]));
  }
  $("st-score").textContent = p.score ?? 0;
  $("st-actions").textContent = game.actions;
  $("st-last").textContent = game.lastAction;
  $("st-dir").textContent = agent ? DIRECTION_NAMES[agent.dir] : "East";
  $("st-arrow").textContent = agent && !agent.hasArrow ? "Used" : "Yes";
  $("st-gold").textContent = agent && agent.hasGold ? "Carrying it" : "No";

  renderKnowledgeBase(agent);
  renderLog(agent);
  updateControls();
}

function renderKnowledgeBase(agent) {
  if (!agent || !agent.kb) {
    $("kb-size").textContent = agent ? "Agent A does not use a knowledge base." : "Start a game to fill the knowledge base.";
    $("kb-last").innerHTML = "";
    $("kb-all").innerHTML = "";
    return;
  }
  const kb = agent.kb;
  $("kb-size").textContent = kb.clauses.length + " clauses over " + kb.symbolCount + " symbols (" +
    kb.axiomCount + " initial axioms). Last TELL:";
  $("kb-last").innerHTML = (agent.lastTold || []).map((c) => "<span>" + c + "</span>").join("");
  // The full list can be long, so it is only built when the box is open.
  if ($("kb-all").parentElement.open) {
    $("kb-all").innerHTML = kb.clauses.map((c) => "<span>" + kb.clauseToString(c) + "</span>").join("");
  }
}
$("kb-all").parentElement.addEventListener("toggle", () => renderKnowledgeBase(game.agent));

function renderLog(agent) {
  if (!agent) return;
  const list = $("log");
  for (; game.shownLog < agent.log.length; game.shownLog++) {
    const entry = agent.log[game.shownLog];
    const li = document.createElement("li");
    li.innerHTML = '<div class="head"><span class="meta">t=' + entry.step + " " + entry.cell + "</span>" +
      escapeHtml(entry.title) + "</div>" +
      (entry.details.length > 0
        ? '<div class="clauses detail">' + entry.details.map((d) => "<span>" + escapeHtml(d) + "</span>").join("") + "</div>"
        : "");
    list.prepend(li);
  }
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------
function setBusy(busy, text) {
  game.busy = busy;
  if (text !== undefined) showMessage(text);
  updateControls();
}

function showMessage(text) {
  $("message").classList.remove("error");
  $("message").textContent = text;
}

export function explainError(error) {
  if (error.name === "AbortError") {
    return "The server did not answer in 90 seconds. It may be waking up; try again.";
  }
  if (error instanceof TypeError) {
    // fetch throws TypeError when the request is blocked or the network fails.
    return "Could not reach the server. For localhost, check that the Go server is running. " +
      "For Render, wait a minute if it was asleep; if it still fails, the deployed server " +
      "does not have the CORS change (server-patch/), so the browser blocks it.";
  }
  return error.message;
}

function showError(error) {
  $("message").classList.add("error");
  $("message").textContent = explainError(error);
}

function shortId(id) {
  return id.length > 10 ? id.slice(0, 8) : id;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Tabs and theme
// ---------------------------------------------------------------------------
for (const tab of document.querySelectorAll(".tab")) {
  tab.addEventListener("click", () => {
    for (const t of document.querySelectorAll(".tab")) t.setAttribute("aria-selected", String(t === tab));
    $("play").hidden = tab.dataset.tab !== "play";
    $("experiments").hidden = tab.dataset.tab !== "experiments";
  });
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $("theme").textContent = theme === "light" ? "Dark theme" : "Light theme";
}
applyTheme(loadSetting("theme", "dark"));
$("theme").addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  applyTheme(next);
  saveSetting("theme", next);
});

setupExperiments({ explainError, loadSetting, saveSetting });
render();
