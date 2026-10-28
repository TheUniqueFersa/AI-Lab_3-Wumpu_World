// experiments.js
// The "Experiments" tab: runs many games and shows the comparison of the agents.

import { createServer, fillServerSelect } from "../world/servers.js";
import { DEFAULT_SERVER, SIMULATOR } from "../config.js";
import { runExperiment, summarizeByConfig, toCsv } from "../experiments/runner.js";

const $ = (id) => document.getElementById(id);

export function setupExperiments({ explainError }) {
  let rows = [];
  fillServerSelect($("exp-backend"));
  $("exp-backend").value = DEFAULT_SERVER;
  let stopRequested = false;

  $("exp-run").addEventListener("click", run);
  $("exp-stop").addEventListener("click", () => {
    stopRequested = true;
    $("exp-status").textContent = "Stopping after the current game...";
  });
  $("exp-csv").addEventListener("click", () => download(toCsv(rows), "wumpus-results.csv"));

  async function run() {
    const configs = readConfigs();
    if (configs.length === 0) {
      setStatus("Select at least one agent.", true);
      return;
    }
    const games = Math.max(1, Number($("exp-games").value) || 1);
    const server = createServer($("exp-backend").value);
    const total = games * configs.length;

    rows = [];
    stopRequested = false;
    $("exp-run").disabled = true;
    $("exp-stop").disabled = false;
    $("exp-csv").disabled = true;
    setStatus($("exp-backend").value === SIMULATOR
      ? "Running " + total + " games in the simulator (extra results, not the main ones)..."
      : "Running " + total + " games on " + server.baseUrl + "...");
    const t0 = performance.now();
    let lastDraw = 0;

    rows = await runExperiment(server, configs, games, {
      delayMs: Number($("exp-delay").value) || 0,
      shouldStop: () => stopRequested,
      yieldToUi: true,
      onResult: (row, all) => {
        $("exp-bar").style.width = (100 * all.length) / total + "%";
        // Redraw at most twice per second so the page stays responsive.
        if (performance.now() - lastDraw > 500 || all.length === total) {
          lastDraw = performance.now();
          const seconds = ((performance.now() - t0) / 1000).toFixed(0);
          setStatus(all.length + " of " + total + " games played (" + seconds + " s).");
          draw(all);
        }
      },
      onError: (error, config) => setStatus("A game of agent " + config.agent + " failed: " + explainError(error), true),
    });

    draw(rows);
    $("exp-run").disabled = false;
    $("exp-stop").disabled = true;
    $("exp-csv").disabled = rows.length === 0;
    if (!$("exp-status").classList.contains("error")) {
      setStatus("Finished: " + rows.length + " games. Download the CSV to keep the results.");
    }
  }

  function readConfigs() {
    const agents = [...document.querySelectorAll(".exp-agent:checked")].map((el) => el.value);
    const thresholds = $("exp-thresholds").value.split(",").map(Number).filter((t) => t > 0 && t <= 1);
    const configs = [];
    for (const agent of agents) {
      if (agent === "C") {
        for (const t of thresholds.length ? thresholds : [0.35]) configs.push({ agent, riskThreshold: t });
      } else {
        configs.push({ agent });
      }
    }
    if ($("exp-code").checked) {
      for (const c of configs.filter((c) => c.agent !== "A")) configs.push({ ...c, useCodeRules: true });
    }
    return configs;
  }

  function draw(all) {
    const summaries = summarizeByConfig(all);
    $("exp-charts").innerHTML = outcomeChart(summaries) + scoreChart(summaries);
    $("exp-tables").innerHTML =
      table("All games", summaries) +
      table("Games with breeze in [1,1]", summarizeByConfig(all, (r) => r.startBreeze === 1)) +
      table("Games without breeze in [1,1]", summarizeByConfig(all, (r) => r.startBreeze === 0));
  }

  function setStatus(text, isError = false) {
    $("exp-status").textContent = text;
    $("exp-status").classList.toggle("error", isError);
  }
}

// Stacked bar per configuration: gold, empty-handed, death.
function outcomeChart(summaries) {
  const rows = summaries.map((s) =>
    '<div class="bar-row"><span class="name">' + s.name + '</span><div class="bar-track">' +
    '<div class="seg-gold" style="width:' + 100 * s.goldRate + '%"></div>' +
    '<div class="seg-empty" style="width:' + 100 * s.emptyRate + '%"></div>' +
    '<div class="seg-death" style="width:' + 100 * s.deathRate + '%"></div>' +
    '</div><span class="value">' + pct(s.goldRate) + "</span></div>").join("");
  return '<div class="chart"><h3>How the games ended</h3>' + rows +
    '<div class="chart-key"><span><i class="seg-gold" style="background:var(--gold)"></i>Gold</span>' +
    '<span><i style="background:var(--muted)"></i>Left without gold</span>' +
    '<span><i style="background:var(--danger)"></i>Died</span></div></div>';
}

// Mean score per configuration, on a scale from -1000 to +1000.
function scoreChart(summaries) {
  const rows = summaries.map((s) => {
    const share = Math.abs(s.meanScore) / 2000;
    const left = s.meanScore >= 0 ? 50 : 50 - 100 * share;
    const cls = s.meanScore >= 0 ? "seg-score" : "seg-neg";
    return '<div class="bar-row"><span class="name">' + s.name + '</span><div class="bar-track">' +
      '<div class="' + cls + '" style="margin-left:' + left + "%;width:" + 100 * share + '%"></div>' +
      '<span class="zero" style="left:50%"></span></div><span class="value">' + s.meanScore.toFixed(0) + "</span></div>";
  }).join("");
  return '<div class="chart"><h3>Mean score (scale -1000 to 1000)</h3>' + rows + "</div>";
}

function table(title, summaries) {
  if (summaries.length === 0) return "";
  const hasOptimum = summaries.some((s) => s.meanOptimum !== null);
  const head = ["Configuration", "Games", "Gold", "Died", "Left", "Mean score", "Median", "Actions",
    "Arrow used", "DPLL calls", "Think ms"].concat(hasOptimum ? ["Best possible"] : []);
  const body = summaries.map((s) => [
    s.name, s.n, pct(s.goldRate) + " ± " + pct(s.goldCi), pct(s.deathRate), pct(s.emptyRate),
    s.meanScore.toFixed(0) + " ± " + s.ciScore.toFixed(0), s.medianScore.toFixed(0), s.meanActions.toFixed(1),
    pct(s.arrowRate), s.meanDpllCalls.toFixed(0), s.meanThinkMs.toFixed(1),
  ].concat(hasOptimum ? [s.meanOptimum.toFixed(0)] : []));
  return '<div class="table-wrap"><table><caption>' + title + "</caption><thead><tr>" +
    head.map((h) => "<th>" + h + "</th>").join("") + "</tr></thead><tbody>" +
    body.map((r) => "<tr>" + r.map((c) => "<td>" + c + "</td>").join("") + "</tr>").join("") +
    "</tbody></table></div>";
}

function pct(value) {
  return (100 * value).toFixed(1) + "%";
}

function download(text, filename) {
  const blob = new Blob([text], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
