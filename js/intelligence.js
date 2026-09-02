(function () {
  const root = document.getElementById("intel");
  if (!root || root.dataset.intelReady === "true") return;
  root.dataset.intelReady = "true";

  const {escapeHtml} = window.gateShared;
  const body = document.getElementById("intelBody");
  const meta = document.getElementById("intelMeta");
  const nav = document.getElementById("intelNav");
  if (!body || !nav) return;

  const SLICE_ORDER = ["wire", "rivalries", "book", "draft", "trades", "power"];
  let intel = null;
  let slice = "wire";
  let ownerA = "";
  let ownerB = "";
  let tradeOwner = "All";
  let powerOwner = null;
  let copied = false;

  function pts(value) {
    if (value == null || Number.isNaN(Number(value))) return "—";
    return Number(value).toFixed(2);
  }

  function signed(value) {
    const n = Number(value) || 0;
    return `${n >= 0 ? "+" : ""}${n.toFixed(1)}`;
  }

  function titleWord(n) {
    return Number(n) === 1 ? "title" : "titles";
  }

  function shortName(name) {
    const parts = String(name || "").trim().split(/\s+/);
    if (parts.length < 2) return name || "";
    return `${parts[0][0]}. ${parts[parts.length - 1]}`;
  }

  function activate(name) {
    slice = name;
    nav.querySelectorAll("[data-intel-slice]").forEach((button) => {
      const active = button.dataset.intelSlice === name;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    render();
  }

  function metric(label, value, hint) {
    return `<div class="intel-metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong>${hint ? `<small>${escapeHtml(hint)}</small>` : ""}</div>`;
  }

  function scoreList(title, games) {
    const rows = (games || []).map((game) => `<li>
      <p class="intel-kicker">${escapeHtml(String(game.year))} · ${escapeHtml(game.label || "")} · W${escapeHtml(String(game.week))}</p>
      <p>${escapeHtml(game.winner)} ${escapeHtml(pts(game.winnerScore))} – ${escapeHtml(pts(game.loserScore))} ${escapeHtml(game.loser)}${game.margin != null ? `<span class="intel-muted"> · ${escapeHtml(pts(game.margin))}</span>` : ""}</p>
    </li>`).join("");
    return `<section class="intel-block"><h3>${escapeHtml(title)}</h3><ul class="intel-list">${rows || "<li class=\"intel-empty\">None in the book.</li>"}</ul></section>`;
  }

  function pickTable(title, hint, rows) {
    const cards = (rows || []).slice(0, 10).map((row) => `<li class="intel-pick">
      <div>
        <p class="intel-name">${escapeHtml(row.player)}</p>
        <p class="intel-muted">${escapeHtml(String(row.year))} · ${escapeHtml(row.draftedBy)} · Rd ${escapeHtml(String(row.round))} (#${escapeHtml(String(row.overall))}) · ${escapeHtml(row.pos)}</p>
      </div>
      <div class="intel-pick-score">
        <strong>${escapeHtml(pts(row.points))}</strong>
        <small class="${row.value >= 0 ? "is-up" : "is-down"}">${escapeHtml(signed(row.value))}</small>
      </div>
    </li>`).join("");
    return `<section class="intel-block"><h3>${escapeHtml(title)}</h3>${hint ? `<p class="intel-lead">${escapeHtml(hint)}</p>` : ""}<ul class="intel-list">${cards || "<li class=\"intel-empty\">None in the book.</li>"}</ul></section>`;
  }

  function tradeCard(deal) {
    const winner = deal.winner ? deal.sides.find((side) => side.owner === deal.winner) : null;
    const sides = (deal.sides || []).map((side) => `<div class="intel-trade-side">
      <span>${escapeHtml(side.owner)}</span>
      <p>Gets ${escapeHtml((side.received || []).join(", ") || "—")}</p>
      <small>Sends ${escapeHtml((side.sent || []).join(", ") || "—")}</small>
      <b class="${side.net >= 0 ? "is-up" : "is-down"}">${escapeHtml(signed(side.net))}</b>
    </div>`).join("");
    return `<li class="intel-trade">
      <div class="intel-trade-head">
        <span>${escapeHtml(String(deal.year))} · W${escapeHtml(String(deal.week))}</span>
        ${winner ? `<em>${escapeHtml(deal.winner.split(" ")[0])} ${escapeHtml(signed(winner.net))}</em>` : ""}
      </div>
      <div class="intel-trade-grid">${sides}</div>
    </li>`;
  }

  function oriented(pair, owner) {
    const same = pair.a === owner;
    return {
      aWins: same ? pair.all.wins : pair.all.losses,
      bWins: same ? pair.all.losses : pair.all.wins,
      ties: pair.all.ties || 0,
      regular: same ? pair.regular.text : `${pair.regular.losses}-${pair.regular.wins}${pair.regular.ties ? `-${pair.regular.ties}` : ""}`,
      playoffs: same ? pair.playoffs.text : `${pair.playoffs.losses}-${pair.playoffs.wins}${pair.playoffs.ties ? `-${pair.playoffs.ties}` : ""}`,
    };
  }

  function ownerOptions(people, selected) {
    return people.map((name) => `<option value="${escapeHtml(name)}"${name === selected ? " selected" : ""}>${escapeHtml(name)}</option>`).join("");
  }

  function renderWire() {
    const stories = (intel.headlines || []).map((story) => `<li class="intel-story">
      <p class="intel-kicker">${escapeHtml(story.kicker)}${story.year ? ` · ${escapeHtml(String(story.year))}` : ""}</p>
      <h3>${escapeHtml(story.title)}</h3>
      <p>${escapeHtml(story.dek)}</p>
    </li>`).join("");
    return `<div class="intel-metrics">${metric("Games", intel.generatedFor.gameCount)}${metric("Titles, tied", "3–3", "Jared · Tommy")}${metric("Executed trades", intel.generatedFor.tradeCount, "2019–2025, scored")}</div>
      <ol class="intel-stories">${stories}</ol>
      <div class="intel-actions">
        <button type="button" class="btn btn-ghost" data-intel-jump="rivalries">Open rivalries</button>
        <button type="button" class="btn btn-ghost" data-intel-jump="trades">Open trades</button>
        <button type="button" class="btn btn-ghost" data-intel-copy>${copied ? "Copied" : "Copy JSON"}</button>
        <button type="button" class="btn btn-ghost" data-intel-download>Download JSON</button>
      </div>`;
  }

  function renderRivalries() {
    const people = intel.rivalries.participants || [];
    const pair = (intel.rivalries.pairs || []).find((row) =>
      (row.a === ownerA && row.b === ownerB) || (row.a === ownerB && row.b === ownerA),
    );
    const lopsided = (intel.rivalries.mostLopsided || []).map((row) => `<li>
      <button type="button" class="intel-row-btn" data-intel-pair-a="${escapeHtml(row.a)}" data-intel-pair-b="${escapeHtml(row.b)}">
        <span>${escapeHtml(row.a)} vs ${escapeHtml(row.b)}</span>
        <strong>${escapeHtml(row.all.text)}</strong>
      </button>
    </li>`).join("");
    let matchup = "<p class=\"intel-lead\">Pick two different managers.</p>";
    if (ownerA !== ownerB && pair) {
      const view = oriented(pair, ownerA);
      matchup = `<div class="intel-h2h">
        <div><span>${escapeHtml(ownerA)}</span><strong>${escapeHtml(String(view.aWins))}</strong></div>
        <div class="intel-h2h-mid"><span>All-time</span><b>${escapeHtml(String(view.aWins))}–${escapeHtml(String(view.bWins))}${view.ties ? `–${escapeHtml(String(view.ties))}` : ""}</b><small>${escapeHtml(String(pair.games))} meetings</small></div>
        <div><span>${escapeHtml(ownerB)}</span><strong>${escapeHtml(String(view.bWins))}</strong></div>
      </div>
      <div class="intel-splits"><div><span>Regular</span><strong>${escapeHtml(view.regular)}</strong></div><div><span>Playoffs</span><strong>${escapeHtml(view.playoffs)}</strong></div></div>`;
    } else if (ownerA !== ownerB) {
      matchup = "<p class=\"intel-lead\">No games in the archive.</p>";
    }

    const matrixRows = intel.rivalries.matrix?.rows || [];
    const cells = intel.rivalries.matrix?.cells || [];
    const head = matrixRows.map((name) => `<th>${escapeHtml(shortName(name))}</th>`).join("");
    const body = matrixRows.map((rowName, i) => `<tr>
      <th>${escapeHtml(shortName(rowName))}</th>
      ${(cells[i] || []).map((cell, j) => {
        const colName = matrixRows[j] || "";
        if (!cell) return "<td class=\"intel-self\">·</td>";
        const cls = cell.wins > cell.losses ? "is-up" : cell.wins < cell.losses ? "is-down" : "";
        return `<td><button type="button" class="intel-cell ${cls}" data-intel-pair-a="${escapeHtml(rowName)}" data-intel-pair-b="${escapeHtml(colName)}">${escapeHtml(cell.text)}</button></td>`;
      }).join("")}
    </tr>`).join("");

    return `<div class="intel-selects">
        <label>Manager A<select data-intel-a>${ownerOptions(people, ownerA)}</select></label>
        <span>vs</span>
        <label>Manager B<select data-intel-b>${ownerOptions(people, ownerB)}</select></label>
      </div>
      ${matchup}
      <section class="intel-block"><h3>Most lopsided</h3><ul class="intel-list">${lopsided}</ul></section>
      <section class="intel-block"><h3>Matrix</h3><p class="intel-lead">Read across: that manager’s record against the column.</p>
        <div class="season-table-wrap intel-matrix-wrap"><table class="season-archive-table intel-matrix"><thead><tr><th></th>${head}</tr></thead><tbody>${body}</tbody></table></div>
      </section>`;
  }

  function renderBook() {
    const heartbreaks = (intel.heartbreaks || []).map((row) => `<li class="intel-story">
      <div class="intel-trade-head"><span>${escapeHtml(String(row.year))}</span><em>${escapeHtml(String(row.kind || "").replaceAll("-", " "))}</em></div>
      <h3>${escapeHtml(row.title)}</h3>
      <p>${escapeHtml(row.detail)}</p>
    </li>`).join("");
    const records = (intel.records || []).map((row) => `<li class="record-card"><span class="label">${escapeHtml(row.label)}</span><strong class="val">${escapeHtml(row.value)}</strong><p class="sub">${escapeHtml(row.detail)}</p></li>`).join("");
    return `<section class="intel-block"><h3>Heartbreaks</h3><ol class="intel-stories">${heartbreaks}</ol></section>
      <ul class="record-grid intel-records">${records}</ul>
      ${scoreList("Closest playoff games", intel.games.closestPlayoff)}
      ${scoreList("Playoff beatdowns", intel.games.playoffBlowouts)}
      ${scoreList("Championships", intel.games.championships)}`;
  }

  function renderDraft() {
    const pipeline = (intel.movements?.keeperPipeline || []).map((row) => `<li class="intel-story">
      <p class="intel-kicker">${escapeHtml(String(row.year))}</p>
      <h3>${escapeHtml(row.player)}</h3>
      <p>${escapeHtml(row.note)}</p>
    </li>`).join("");
    return `${pickTable("Steals", "Round 6 or later, value over positional expect.", intel.draft.steals)}
      ${pickTable("Busts", "Rounds 1–2 that did not pay.", intel.draft.busts)}
      ${pickTable("Keeper hits", "", intel.draft.keeperHits)}
      <section class="intel-block"><h3>Keeper pipeline</h3><p class="intel-lead">Same player kept in consecutive years by different managers.</p><ul class="intel-list">${pipeline || "<li class=\"intel-empty\">No pipeline flips in the book.</li>"}</ul></section>`;
  }

  function renderTrades() {
    const people = ["All", ...(intel.rivalries.participants || [])];
    const featured = tradeOwner === "All" ? (intel.trades.biggestSwings || []).slice(0, 6) : [];
    const featuredIds = new Set(featured.map((deal) => deal.id));
    const deals = (intel.trades.deals || []).filter((deal) => {
      if (tradeOwner !== "All" && !(deal.owners || []).includes(tradeOwner)) return false;
      if (tradeOwner === "All" && featuredIds.has(deal.id)) return false;
      return true;
    });
    return `<p class="intel-lead">${escapeHtml(intel.trades.caveat || "")}</p>
      <label class="intel-filter">Filter<select data-intel-trade-owner>${ownerOptions(people, tradeOwner)}</select></label>
      ${featured.length ? `<section class="intel-block"><h3>Biggest swings</h3><ul class="intel-list">${featured.map(tradeCard).join("")}</ul></section>` : ""}
      <section class="intel-block"><h3>${tradeOwner === "All" ? "All executed deals" : escapeHtml(tradeOwner)}</h3><p class="intel-lead">${escapeHtml(String(deals.length))} trades</p><ul class="intel-list">${deals.map(tradeCard).join("")}</ul></section>`;
  }

  function renderDossier(owner) {
    const row = (intel.owners || []).find((item) => item.owner === owner);
    if (!row) return "";
    const heartbreaks = (row.heartbreaks || []).map((item) => `<li class="intel-story"><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.detail)}</p></li>`).join("");
    return `<div class="intel-dossier">
      <div class="intel-story">
        <p class="intel-kicker">${escapeHtml(row.role)} · power #${escapeHtml(String(row.powerRank))}</p>
        <h3>${escapeHtml(row.owner)}</h3>
        <dl class="intel-stats">
          <div><dt>Record</dt><dd>${escapeHtml(row.record.text)}</dd></div>
          <div><dt>Titles</dt><dd>${escapeHtml(String(row.titles))}</dd></div>
          <div><dt>Playoffs</dt><dd>${escapeHtml(String(row.playoffAppearances))}</dd></div>
          <div><dt>Avg finish</dt><dd>${escapeHtml(String(row.avgFinish))}</dd></div>
        </dl>
        <p class="intel-lead">Nemesis: ${escapeHtml(row.nemesis || "none")} · trade net ${escapeHtml(signed(row.tradeNet))} across ${escapeHtml(String(row.tradeCount))} deals</p>
      </div>
      ${row.signatureWin ? scoreList("Signature win", [row.signatureWin]) : ""}
      ${row.signatureLoss ? scoreList("Signature loss", [row.signatureLoss]) : ""}
      ${row.signatureTrade ? `<section class="intel-block"><h3>Signature trade</h3><ul class="intel-list">${tradeCard(row.signatureTrade)}</ul></section>` : ""}
      ${pickTable("Steals", "", row.draftSteals)}
      ${heartbreaks ? `<section class="intel-block"><h3>Heartbreaks</h3><ul class="intel-list">${heartbreaks}</ul></section>` : ""}
    </div>`;
  }

  function renderPower() {
    const rows = (intel.powerRankings || []).map((row) => {
      const active = row.owner === powerOwner;
      return `<li>
        <button type="button" class="intel-power${active ? " is-active" : ""}" data-intel-power="${escapeHtml(row.owner)}">
          <b>${escapeHtml(String(row.rank))}</b>
          <div>
            <strong>${escapeHtml(row.owner)}</strong>
            <span>${escapeHtml(row.record.text)} · ${escapeHtml(String(row.titles))} ${escapeHtml(titleWord(row.titles))} · avg ${escapeHtml(String(row.avgFinish))}</span>
          </div>
          <em>${escapeHtml(row.score.toFixed(1))}</em>
        </button>
        ${active ? renderDossier(row.owner) : ""}
      </li>`;
    }).join("");
    return `<p class="intel-lead">Score = titles×18 + finals×6 + playoff trips×3 + (13−avg finish)×4 + win%×40 + last-three-seasons form. Tap a name for the dossier.</p>
      <ol class="intel-power-list">${rows}</ol>`;
  }

  function render() {
    if (!intel) return;
    const painters = {wire: renderWire, rivalries: renderRivalries, book: renderBook, draft: renderDraft, trades: renderTrades, power: renderPower};
    body.innerHTML = painters[slice]();
  }

  function copyJson() {
    const raw = JSON.stringify(intel, null, 2);
    const done = () => {
      copied = true;
      render();
      window.setTimeout(() => {
        copied = false;
        if (slice === "wire") render();
      }, 1600);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(raw).then(done).catch(() => fallbackDownload(raw, true));
    } else {
      fallbackDownload(raw, true);
    }
  }

  function fallbackDownload(raw, copiedOnly) {
    if (copiedOnly) {
      copied = true;
      render();
      return;
    }
    const blob = new Blob([raw], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "1048-gate-intelligence.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  nav.addEventListener("click", (event) => {
    const button = event.target.closest("[data-intel-slice]");
    if (button) activate(button.dataset.intelSlice);
  });

  body.addEventListener("click", (event) => {
    const jump = event.target.closest("[data-intel-jump]");
    if (jump) {
      activate(jump.dataset.intelJump);
      return;
    }
    if (event.target.closest("[data-intel-copy]")) {
      copyJson();
      return;
    }
    if (event.target.closest("[data-intel-download]")) {
      fallbackDownload(JSON.stringify(intel, null, 2), false);
      return;
    }
    const pair = event.target.closest("[data-intel-pair-a]");
    if (pair) {
      ownerA = pair.dataset.intelPairA;
      ownerB = pair.dataset.intelPairB;
      render();
      return;
    }
    const power = event.target.closest("[data-intel-power]");
    if (power) {
      powerOwner = powerOwner === power.dataset.intelPower ? null : power.dataset.intelPower;
      render();
    }
  });

  body.addEventListener("change", (event) => {
    if (event.target.matches("[data-intel-a]")) {
      ownerA = event.target.value;
      render();
    } else if (event.target.matches("[data-intel-b]")) {
      ownerB = event.target.value;
      render();
    } else if (event.target.matches("[data-intel-trade-owner]")) {
      tradeOwner = event.target.value;
      render();
    }
  });

  async function load() {
    body.innerHTML = '<div class="panel"><div class="history-loading">Computing the book…</div></div>';
    try {
      const response = await fetch("data/intelligence.json", {cache: "no-store"});
      if (!response.ok) throw new Error(`intelligence.json returned HTTP ${response.status}`);
      intel = await response.json();
      const people = intel.rivalries?.participants || [];
      ownerA = people[0] || "";
      ownerB = people[1] || "";
      if (meta) {
        meta.textContent = `${intel.generatedFor.gameCount} games · ${intel.generatedFor.draftPicks} draft picks · ${intel.generatedFor.tradeCount} executed trades · ${intel.generatedFor.seasonRange.from}–${intel.generatedFor.seasonRange.to}`;
      }
      render();
    } catch (error) {
      console.error("Unable to load league intelligence:", error);
      body.innerHTML = '<div class="panel"><div class="history-loading">League intelligence could not be loaded.</div></div>';
    }
  }

  document.addEventListener("gate:viewchange", (event) => {
    if (event.detail?.name === "intel" && !intel) load();
  });

  if (document.getElementById("intel")?.classList.contains("active")) load();
  else if (window.location.hash.slice(1) === "intel") load();
})();
