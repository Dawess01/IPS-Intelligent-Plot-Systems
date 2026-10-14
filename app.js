(() => {
  const STORAGE_KEY = "lighting-rig-designer-v1";
  const MAX_WAYS = 24;
  const DMX_MAX = 512;
  const SCALE = PLOT_CONFIG.scale;
  const GRID = PLOT_CONFIG.gridM;

  // ---------- helpers ----------
  const $ = (sel) => document.querySelector(sel);
  const uid = () => Math.random().toString(36).slice(2, 10);
  const esc = (v) =>
    String(v ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const round2 = (n) => Math.round(n * 100) / 100;
  const pad3 = (n) => String(n).padStart(3, "0");
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const clampInt = (v, lo, hi) => clamp(Math.round(Number(v)) || lo, lo, hi);
  const snap = (v) => Math.round(v / GRID) * GRID;
  const byName = (a, b) => String(a).localeCompare(String(b), "en", { sensitivity: "base" });
  const plugById = (id) => PLUG_TYPES.find((p) => p.id === id) || PLUG_TYPES[1];
  const wattsToAmps = (w) => w / MAINS_VOLTAGE;
  const plugOptions = (selected) =>
    PLUG_TYPES.map((p) =>
      `<option value="${p.id}" ${p.id === selected ? "selected" : ""}>${esc(p.label)}</option>`
    ).join("");
  const csv = (rows) =>
    rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");

  // ---------- state ----------
  let state = loadState();
  let view = "rig";
  let selectedFixtureId = null;
  let selectedItemId = null;
  let drag = null;
  const collapsedBrands = new Set();

  function normalise(data) {
    const plot = { widthM: PLOT_CONFIG.widthM, heightM: PLOT_CONFIG.heightM, ...(data.plot || {}) };
    plot.items = Array.isArray(plot.items) ? plot.items : [];
    return {
      bars: data.bars || [],
      racks: data.racks || [],
      custom: data.custom || [],
      plot,
    };
  }

  function loadState() {
    try {
      return normalise(JSON.parse(localStorage.getItem(STORAGE_KEY)) || {});
    } catch {
      return normalise({});
    }
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render();
  }

  // ---------- lookups ----------
  const allFixtures = () => [...FIXTURES, ...state.custom];
  const fixtureById = (id) => allFixtures().find((f) => f.id === id) || null;
  const chCount = (f) => Math.max(1, Number(f?.channels) || 1);
  const slotWatts = (slot) => fixtureById(slot.fixtureId)?.watts ?? 0;
  const barWatts = (bar) => bar.slots.reduce((sum, s) => sum + slotWatts(s), 0);
  const barAmps = (bar) => wattsToAmps(barWatts(bar));
  const isBranded = (f) => f.brand !== "Generic" && !f.id.startsWith("custom-");

  function channelOf(barId) {
    for (const rack of state.racks) {
      const ch = rack.channels.find((c) => c.barId === barId);
      if (ch) return { rack, ch };
    }
    return null;
  }

  // ---------- rig calculations ----------
  function barWarnings(bar) {
    const warnings = [];
    bar.slots.forEach((slot, i) => {
      const f = fixtureById(slot.fixtureId);
      if (!f) return;
      const a = wattsToAmps(f.watts);
      const limit = plugById(slot.plug).amps * LOAD_LIMIT;
      if (a > limit) {
        warnings.push(`Way ${i + 1}: ${f.model} draws ${round2(a)} A, above ${round2(limit)} A (80% of a ${plugById(slot.plug).amps} A plug).`);
      }
    });

    const total = barAmps(bar);
    const feedLimit = plugById(bar.feedPlug).amps * LOAD_LIMIT;
    if (total > feedLimit) {
      warnings.push(`Bar draws ${round2(total)} A, above ${round2(feedLimit)} A on its ${plugById(bar.feedPlug).amps} A feed.`);
    }

    const feed = channelOf(bar.id);
    if (feed && total > feed.ch.size * LOAD_LIMIT) {
      warnings.push(`Bar draws ${round2(total)} A, above ${round2(feed.ch.size * LOAD_LIMIT)} A on ${feed.rack.name} Ch ${feed.ch.no} (${feed.ch.size} A).`);
    }
    return warnings;
  }

  // ---------- plot helpers ----------
  const itemEnd = (item) => item.address + chCount(fixtureById(item.fixtureId)) - 1;

  function conflictIds() {
    const ids = new Set();
    const items = state.plot.items;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];
        if (a.universe !== b.universe) continue;
        if (a.address <= itemEnd(b) && b.address <= itemEnd(a)) {
          ids.add(a.id);
          ids.add(b.id);
        }
      }
    }
    return ids;
  }

  function nextFree(channels) {
    let universe = 1;
    while (true) {
      const used = state.plot.items.filter((i) => i.universe === universe).map(itemEnd);
      const start = used.length ? Math.max(...used) + 1 : 1;
      if (start + channels - 1 <= DMX_MAX) return { universe, address: start };
      universe++;
    }
  }

  function addPlotItem(fixtureId, x = 1, y = 1) {
    const f = fixtureById(fixtureId);
    if (!f) return;
    const { universe, address } = nextFree(chCount(f));
    const item = {
      id: uid(),
      fixtureId: f.id,
      x: clamp(snap(x), 0, state.plot.widthM),
      y: clamp(snap(y), 0, state.plot.heightM),
      rot: 0,
      universe,
      address,
      label: "",
    };
    state.plot.items.push(item);
    selectedItemId = item.id;
    persist();
  }

  function fitItems() {
    state.plot.items.forEach((i) => {
      i.x = clamp(i.x, 0, state.plot.widthM);
      i.y = clamp(i.y, 0, state.plot.heightM);
    });
  }

  function symbolSvg(type) {
    const beam = `<line x1="0" y1="0" x2="0" y2="-26" class="beam"/>`;
    const shapes = {
      "LED Par": `<circle r="11" class="body"/><circle r="5" class="lens"/>`,
      "Profile (Ellipsoidal)": `<rect x="-13" y="-8" width="26" height="16" rx="2" class="body"/><rect x="-9" y="-8" width="18" height="4" class="lens"/>`,
      "Fresnel": `<circle r="11" class="body"/><circle r="5" class="cross"/>`,
      "Moving Head Spot": `<circle r="9" class="body"/><path d="M-5 0H5M0 -5V5" class="cross"/>`,
      "Moving Head Wash": `<circle r="9" class="body"/><rect x="-4" y="-4" width="8" height="8" class="lens"/>`,
      "LED Bar / Batten": `<rect x="-18" y="-4" width="36" height="8" rx="1" class="body"/><circle cx="-12" cy="0" r="1.5" class="lens"/><circle cx="-4" cy="0" r="1.5" class="lens"/><circle cx="4" cy="0" r="1.5" class="lens"/><circle cx="12" cy="0" r="1.5" class="lens"/>`,
      "Strobe": `<polygon points="0,-10 10,0 0,10 -10,0" class="body"/>`,
      "Follow Spot": `<circle r="11" class="body"/><polygon points="0,-6 5,4 -5,4" class="lens"/>`,
      "Hazer / FX": `<rect x="-12" y="-9" width="24" height="18" class="body"/><path d="M-6 -3H6M-6 3H6" class="cross"/>`,
    };
    return (shapes[type] || `<rect x="-10" y="-10" width="20" height="20" class="body"/>`) + beam;
  }

  // ---------- rendering ----------
  function render() {
    renderLibrary();
    if (view === "rig") {
      renderBars();
      renderRacks();
      renderSummary();
    } else {
      renderPlot();
    }
  }

  function fixtureItemHtml(f) {
    return `
      <li class="fixture ${f.id === selectedFixtureId ? "selected" : ""}" draggable="true" data-fixture="${esc(f.id)}">
        <div><strong>${esc(f.model)}</strong>${isBranded(f) ? ` <span class="tag" title="Approximate, check the datasheet">check datasheet</span>` : ""}</div>
        <div class="muted">${esc(f.type)} · ${f.watts} W · ${round2(wattsToAmps(f.watts))} A · ${chCount(f)} ch</div>
        <div class="muted">${esc(plugById(f.plug).label)}</div>
        ${view === "plot" ? `<button class="ghost small" data-action="add-plot">Add to plot</button>` : ""}
      </li>`;
  }

  function renderLibrary() {
    const brandSel = $("#brandFilter");
    const current = brandSel.value;
    const brands = [...new Set(allFixtures().map((f) => f.brand))].sort(byName);
    brandSel.innerHTML =
      `<option value="">All brands</option>` +
      brands.map((b) => `<option value="${esc(b)}" ${b === current ? "selected" : ""}>${esc(b)}</option>`).join("");

    const q = $("#search").value.trim().toLowerCase();
    const brand = brandSel.value;
    const list = allFixtures()
      .filter((f) =>
        (!brand || f.brand === brand) &&
        (!q || `${f.brand} ${f.model} ${f.type}`.toLowerCase().includes(q)))
      .sort((a, b) => byName(a.brand, b.brand) || byName(a.model, b.model));

    const groups = {};
    list.forEach((f) => { (groups[f.brand] ||= []).push(f); });
    const names = Object.keys(groups);

    $("#libHint").textContent = view === "plot"
      ? "Drag a fixture onto the plot, or use Add to plot."
      : "Click a fixture to select it, then click an empty slot. Or drag it onto a slot.";

    $("#library").innerHTML = names.length
      ? names.map((b) => `
        <details class="brand" data-brand="${esc(b)}" ${collapsedBrands.has(b) ? "" : "open"}>
          <summary>${esc(b)} <span class="muted">${groups[b].length}</span></summary>
          <ul class="fixture-list">${groups[b].map(fixtureItemHtml).join("")}</ul>
        </details>`).join("")
      : `<p class="muted">No fixtures match.</p>`;
  }

  // rig view
  function renderBars() {
    const el = $("#bars");
    if (!state.bars.length) {
      el.innerHTML = `<p class="muted">No bars yet. Add one above.</p>`;
      return;
    }
    el.innerHTML = state.bars.map((bar) => {
      const feed = channelOf(bar.id);
      const warnings = barWarnings(bar);
      return `
        <article class="bar" data-bar="${bar.id}">
          <header class="bar-head">
            <input class="bar-name" data-field="name" value="${esc(bar.name)}" aria-label="Bar name">
            <label class="field">Feed
              <select data-field="feedPlug">${plugOptions(bar.feedPlug)}</select>
            </label>
            <div class="stepper" aria-label="Number of ways">
              <button data-action="fewer-ways" ${bar.slots.length <= 1 ? "disabled" : ""}>−</button>
              <span>${bar.slots.length} ways</span>
              <button data-action="more-ways" ${bar.slots.length >= MAX_WAYS ? "disabled" : ""}>+</button>
            </div>
            <button class="ghost" data-action="delete-bar">Delete</button>
          </header>

          <div class="slots">
            ${bar.slots.map((slot, i) => slotHtml(slot, i)).join("")}
          </div>

          <footer class="bar-foot">
            <span>${round2(barWatts(bar))} W</span>
            <span>${round2(barAmps(bar))} A</span>
            <span>${feed ? `Fed from ${esc(feed.rack.name)}, Ch ${feed.ch.no}` : `<em>Not patched to a dimmer</em>`}</span>
          </footer>
          ${warnings.map((w) => `<p class="warn">${esc(w)}</p>`).join("")}
        </article>`;
    }).join("");
  }

  function slotHtml(slot, i) {
    const f = fixtureById(slot.fixtureId);
    const plug = plugById(slot.plug);
    const a = f ? wattsToAmps(f.watts) : 0;
    const over = f && a > plug.amps * LOAD_LIMIT;
    const hint = selectedFixtureId ? " or click to place the selected fixture" : "";
    return `
      <div class="slot ${f ? "" : "empty"} ${over ? "over" : ""}" data-slot="${i}">
        <span class="slot-no">${i + 1}</span>
        <div class="slot-body">
          ${f
            ? `<strong>${esc(f.brand)}</strong> ${esc(f.model)} <span class="muted">${f.watts} W · ${round2(a)} A</span>`
            : `<span class="muted">Empty. Drop a fixture here${hint}.</span>`}
        </div>
        <select data-field="plug" aria-label="Plug for way ${i + 1}">${plugOptions(slot.plug)}</select>
        ${f ? `<button class="ghost" data-action="clear-slot" title="Remove fixture" aria-label="Remove fixture">×</button>` : ""}
      </div>`;
  }

  function renderRacks() {
    const el = $("#racks");
    if (!state.racks.length) {
      el.innerHTML = `<p class="muted">No dimmer racks yet.</p>`;
      return;
    }
    el.innerHTML = state.racks.map((rack) => {
      const patched = rack.channels.filter((c) => c.barId).length;
      return `
        <article class="rack" data-rack="${rack.id}">
          <header class="bar-head">
            <input class="bar-name" data-field="name" value="${esc(rack.name)}" aria-label="Rack name">
            <span class="muted">${rack.channels.length} channels · ${patched} patched</span>
            <button class="ghost" data-action="delete-rack">Delete</button>
          </header>
          <div class="channels">
            ${rack.channels.map(channelHtml).join("")}
          </div>
        </article>`;
    }).join("");
  }

  function channelHtml(ch) {
    const bar = state.bars.find((b) => b.id === ch.barId);
    const load = bar ? barAmps(bar) : 0;
    const pct = ch.size ? load / ch.size : 0;
    const over = load > ch.size * LOAD_LIMIT;
    return `
      <div class="channel ${over ? "over" : ""}" data-channel="${ch.id}">
        <div class="channel-head">
          <strong>Ch ${ch.no}</strong>
          <select data-field="size" aria-label="Channel size">
            ${DIMMER_SIZES.map((s) => `<option value="${s}" ${s === ch.size ? "selected" : ""}>${s} A</option>`).join("")}
          </select>
        </div>
        <label class="field">Bar
          <select data-field="barId">
            <option value="">None</option>
            ${state.bars.map((b) => `<option value="${b.id}" ${b.id === ch.barId ? "selected" : ""}>${esc(b.name)}</option>`).join("")}
          </select>
        </label>
        <label class="field">Phase
          <select data-field="phase">
            ${PHASES.map((p) => `<option ${p === ch.phase ? "selected" : ""}>${p}</option>`).join("")}
          </select>
        </label>
        <div class="muted">${round2(load)} A of ${ch.size} A (${Math.round(pct * 100)}%)</div>
        <div class="meter"><span style="width:${Math.min(100, pct * 100)}%"></span></div>
      </div>`;
  }

  function renderSummary() {
    const placed = state.bars.reduce((n, b) => n + b.slots.filter((s) => s.fixtureId).length, 0);
    const totalWatts = state.bars.reduce((n, b) => n + barWatts(b), 0);
    const totalAmps = wattsToAmps(totalWatts);

    const phaseAmps = { None: 0, L1: 0, L2: 0, L3: 0 };
    state.racks.forEach((rack) =>
      rack.channels.forEach((ch) => {
        const bar = state.bars.find((b) => b.id === ch.barId);
        if (bar) phaseAmps[ch.phase] = (phaseAmps[ch.phase] || 0) + barAmps(bar);
      })
    );

    const unpatched = state.bars.filter((b) => !channelOf(b.id)).length;

    const counts = {};
    state.bars.forEach((b) => b.slots.forEach((s) => {
      const f = fixtureById(s.fixtureId);
      if (f) counts[f.id] = (counts[f.id] || 0) + 1;
    }));
    const schedule = Object.entries(counts)
      .map(([id, n]) => ({ f: fixtureById(id), n }))
      .sort((a, b) => b.n - a.n);

    const warnings = state.bars.flatMap((b) => barWarnings(b).map((w) => `${b.name}: ${w}`));

    $("#summary").innerHTML = `
      <h2>Summary</h2>
      <dl class="stats">
        <dt>Bars</dt><dd>${state.bars.length}</dd>
        <dt>Fixtures placed</dt><dd>${placed}</dd>
        <dt>Total load</dt><dd>${round2(totalWatts)} W · ${round2(totalAmps)} A</dd>
        <dt>Bars not patched</dt><dd>${unpatched}</dd>
      </dl>

      <h3>Phase load (A)</h3>
      <dl class="stats">
        ${PHASES.map((p) => `<dt>${p === "None" ? "Unphased" : p}</dt><dd>${round2(phaseAmps[p] || 0)}</dd>`).join("")}
      </dl>

      <h3>Fixture schedule</h3>
      ${schedule.length
        ? `<ul class="schedule">${schedule.map((r) => `<li><span>${r.n} × ${esc(r.f.brand)} ${esc(r.f.model)}</span><span class="muted">${round2(r.n * wattsToAmps(r.f.watts))} A</span></li>`).join("")}</ul>`
        : `<p class="muted">No fixtures placed yet.</p>`}

      <h3>Warnings</h3>
      ${warnings.length
        ? `<ul class="warn-list">${warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>`
        : `<p class="muted">None. Everything is within the 80% limit.</p>`}

      <p class="hint">Single-phase ${MAINS_VOLTAGE} V assumed. Power factor ignored. Check results against your venue's supply and local regulations.</p>`;
  }

  // plot view
  function renderPlot() {
    const { widthM, heightM, items } = state.plot;
    const W = widthM * SCALE;
    const H = heightM * SCALE;

    let grid = "";
    for (let m = 0; m <= widthM; m++) {
      grid += `<line x1="${m * SCALE}" y1="0" x2="${m * SCALE}" y2="${H}" class="grid"/>`;
      if (m < widthM) grid += `<text x="${m * SCALE + 3}" y="12" class="ruler">${m}m</text>`;
    }
    for (let m = 0; m <= heightM; m++) {
      grid += `<line x1="0" y1="${m * SCALE}" x2="${W}" y2="${m * SCALE}" class="grid"/>`;
      if (m < heightM) grid += `<text x="3" y="${m * SCALE + 12}" class="ruler">${m}m</text>`;
    }

    const conflicts = conflictIds();
    $("#plotCanvas").innerHTML = `
      <svg id="plotSvg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${W}" height="${H}" class="stage"/>
        ${grid}
        ${items.map((i) => plotItemSvg(i, conflicts)).join("")}
      </svg>`;

    $("#plotW").value = widthM;
    $("#plotH").value = heightM;
    renderInspector(conflicts);
    renderPatch(conflicts);
  }

  function plotItemSvg(item, conflicts) {
    const f = fixtureById(item.fixtureId);
    const classes = [
      "plot-item",
      item.id === selectedItemId ? "selected" : "",
      conflicts.has(item.id) ? "conflict" : "",
    ].join(" ");
    return `
      <g class="${classes}" data-item="${item.id}" transform="translate(${item.x * SCALE} ${item.y * SCALE})">
        <rect x="-60" y="-22" width="120" height="68" class="hit"/>
        <g transform="rotate(${item.rot})">${symbolSvg(f?.type)}</g>
        <text y="30" class="label">${esc(item.label || f?.model || "Unknown")}</text>
        <text y="42" class="addr">U${item.universe} ${pad3(item.address)}–${pad3(itemEnd(item))} · ${chCount(f)}ch</text>
      </g>`;
  }

  function renderInspector(conflicts) {
    const el = $("#inspector");
    const item = state.plot.items.find((i) => i.id === selectedItemId);
    if (!item) {
      el.innerHTML = `
        <h2>Selected fixture</h2>
        <p class="muted">Click a fixture on the plot to edit its address, rotation and position.</p>`;
      return;
    }
    const f = fixtureById(item.fixtureId);
    const n = chCount(f);
    el.innerHTML = `
      <h2>Selected fixture</h2>
      <p class="inspector-title"><strong>${esc(f?.brand ?? "")}</strong> ${esc(f?.model ?? "Unknown")}<br>
        <span class="muted">${esc(f?.type ?? "")} · ${n} ch · ${f?.watts ?? 0} W</span></p>
      ${conflicts.has(item.id) ? `<p class="warn">Address range overlaps another fixture on this universe.</p>` : ""}
      <div class="fields">
        <label>Label<input data-field="label" value="${esc(item.label)}"></label>
        <label>Universe<input type="number" min="1" max="16" data-field="universe" value="${item.universe}"></label>
        <label>Address<input type="number" min="1" max="${DMX_MAX - n + 1}" data-field="address" value="${item.address}"></label>
        <label>Rotation °<input type="number" step="15" data-field="rot" value="${item.rot}"></label>
        <label>X (m)<input type="number" step="0.5" min="0" max="${state.plot.widthM}" data-field="x" value="${item.x}"></label>
        <label>Y (m)<input type="number" step="0.5" min="0" max="${state.plot.heightM}" data-field="y" value="${item.y}"></label>
      </div>
      <p class="muted">Uses channels ${pad3(item.address)} to ${pad3(item.address + n - 1)} on universe ${item.universe}.</p>
      <button class="ghost" data-action="delete-item">Remove from plot</button>`;
  }

  function renderPatch(conflicts) {
    const rows = [...state.plot.items].sort((a, b) => a.universe - b.universe || a.address - b.address);
    const used = rows.reduce((n, i) => n + chCount(fixtureById(i.fixtureId)), 0);
    $("#patch").innerHTML = rows.length
      ? `<p class="muted">${rows.length} fixtures · ${used} channels</p>
         <table class="patch">
           <thead><tr><th>Uni</th><th>DMX</th><th>Fixture</th></tr></thead>
           <tbody>${rows.map((i) => {
             const f = fixtureById(i.fixtureId);
             const cls = [i.id === selectedItemId ? "selected" : "", conflicts.has(i.id) ? "conflict" : ""].join(" ");
             return `<tr data-row="${i.id}" class="${cls}">
               <td>${i.universe}</td>
               <td>${pad3(i.address)}–${pad3(itemEnd(i))}</td>
               <td>${esc(i.label || f?.model || "Unknown")}</td>
             </tr>`;
           }).join("")}</tbody>
         </table>`
      : `<p class="muted">No fixtures on the plot yet.</p>`;
  }

  // ---------- actions ----------
  function addBar(form) {
    const data = new FormData(form);
    const ways = clampInt(data.get("ways"), 1, MAX_WAYS);
    const slotPlug = data.get("slotPlug");
    state.bars.push({
      id: uid(),
      name: String(data.get("name")).trim(),
      feedPlug: data.get("feedPlug"),
      slots: Array.from({ length: ways }, () => ({ fixtureId: null, plug: slotPlug })),
    });
    form.reset();
    populateBarForm();
    persist();
  }

  function addRack(form) {
    const data = new FormData(form);
    const count = clampInt(data.get("channels"), 1, 96);
    const size = Number(data.get("size"));
    state.racks.push({
      id: uid(),
      name: String(data.get("name")).trim(),
      channels: Array.from({ length: count }, (_, i) => ({
        id: uid(), no: i + 1, size, barId: null, phase: "None",
      })),
    });
    form.reset();
    persist();
  }

  function placeFixture(bar, index, fixtureId) {
    const f = fixtureById(fixtureId);
    if (!f) return;
    const slot = bar.slots[index];
    slot.fixtureId = f.id;
    slot.plug = f.plug || slot.plug;
    persist();
  }

  function setChannelBar(ch, barId) {
    if (barId) {
      state.racks.forEach((r) => r.channels.forEach((c) => { if (c.barId === barId) c.barId = null; }));
    }
    ch.barId = barId || null;
  }

  const findBar = (el) => state.bars.find((b) => b.id === el.closest("[data-bar]")?.dataset.bar);
  const findRack = (el) => state.racks.find((r) => r.id === el.closest("[data-rack]")?.dataset.rack);

  // ---------- export ----------
  function toScheduleCsv() {
    const rows = [["Bar", "Way", "Brand", "Model", "Type", "Watts", "Amps", "Plug", "Feed"]];
    state.bars.forEach((bar) => {
      const feed = channelOf(bar.id);
      const feedLabel = feed ? `${feed.rack.name} Ch ${feed.ch.no}` : "";
      bar.slots.forEach((slot, i) => {
        const f = fixtureById(slot.fixtureId);
        rows.push([
          bar.name, i + 1,
          f?.brand ?? "", f?.model ?? "", f?.type ?? "",
          f?.watts ?? "", f ? round2(wattsToAmps(f.watts)) : "",
          plugById(slot.plug).label, feedLabel,
        ]);
      });
    });
    return csv(rows);
  }

  function toPatchCsv() {
    const rows = [["Universe", "Start", "End", "Channels", "Fixture", "Label", "X (m)", "Y (m)", "Rotation"]];
    [...state.plot.items]
      .sort((a, b) => a.universe - b.universe || a.address - b.address)
      .forEach((i) => {
        const f = fixtureById(i.fixtureId);
        rows.push([
          i.universe, i.address, itemEnd(i), chCount(f),
          f ? `${f.brand} ${f.model}` : "", i.label, i.x, i.y, i.rot,
        ]);
      });
    return csv(rows);
  }

  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = Object.assign(document.createElement("a"), { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ---------- views ----------
  function setView(v) {
    view = v;
    document.querySelectorAll(".view-tab").forEach((b) =>
      b.setAttribute("aria-selected", String(b.dataset.view === v)));
    $("#rigView").hidden = v !== "rig";
    $("#plotView").hidden = v !== "plot";
    $("#summary").hidden = v !== "rig";
    $("#plotSide").hidden = v !== "plot";
    render();
  }

  // ---------- events ----------
  function bindLibrary() {
    $("#search").addEventListener("input", renderLibrary);
    $("#brandFilter").addEventListener("change", renderLibrary);

    const lib = $("#library");
    lib.addEventListener("click", (e) => {
      const li = e.target.closest("[data-fixture]");
      if (!li) return;
      if (e.target.closest("[data-action='add-plot']")) {
        const n = state.plot.items.length;
        addPlotItem(li.dataset.fixture, 1 + (n % 8) * 1.5, 1 + Math.floor(n / 8) * 2);
        return;
      }
      selectedFixtureId = selectedFixtureId === li.dataset.fixture ? null : li.dataset.fixture;
      render();
    });
    lib.addEventListener("dragstart", (e) => {
      const li = e.target.closest("[data-fixture]");
      if (!li) return;
      e.dataTransfer.setData("text/plain", li.dataset.fixture);
      e.dataTransfer.effectAllowed = "copy";
    });
    lib.addEventListener("toggle", (e) => {
      const b = e.target.dataset.brand;
      if (!b) return;
      if (e.target.open) collapsedBrands.delete(b);
      else collapsedBrands.add(b);
    }, true);
  }

  function bindRig() {
    $("#barForm").addEventListener("submit", (e) => { e.preventDefault(); addBar(e.target); });
    $("#rackForm").addEventListener("submit", (e) => { e.preventDefault(); addRack(e.target); });

    const bars = $("#bars");
    bars.addEventListener("change", (e) => {
      const bar = findBar(e.target);
      if (!bar) return;
      const field = e.target.dataset.field;
      if (field === "name") bar.name = e.target.value.trim() || bar.name;
      if (field === "feedPlug") bar.feedPlug = e.target.value;
      if (field === "plug") {
        const idx = Number(e.target.closest("[data-slot]").dataset.slot);
        bar.slots[idx].plug = e.target.value;
      }
      persist();
    });
    bars.addEventListener("click", (e) => {
      const bar = findBar(e.target);
      if (!bar) return;
      const action = e.target.closest("[data-action]")?.dataset.action;
      if (action === "delete-bar") {
        if (confirm(`Delete bar "${bar.name}"?`)) {
          state.bars = state.bars.filter((b) => b.id !== bar.id);
          state.racks.forEach((r) => r.channels.forEach((c) => { if (c.barId === bar.id) c.barId = null; }));
          persist();
        }
        return;
      }
      if (action === "more-ways" && bar.slots.length < MAX_WAYS) {
        bar.slots.push({ fixtureId: null, plug: bar.slots.at(-1)?.plug || "uk15" });
        return persist();
      }
      if (action === "fewer-ways" && bar.slots.length > 1) {
        bar.slots.pop();
        return persist();
      }
      if (action === "clear-slot") {
        const idx = Number(e.target.closest("[data-slot]").dataset.slot);
        bar.slots[idx].fixtureId = null;
        return persist();
      }
      const slotEl = e.target.closest(".slot.empty");
      if (slotEl && selectedFixtureId) {
        placeFixture(bar, Number(slotEl.dataset.slot), selectedFixtureId);
      }
    });
    bars.addEventListener("dragover", (e) => {
      if (e.target.closest(".slot")) e.preventDefault();
    });
    bars.addEventListener("drop", (e) => {
      const slotEl = e.target.closest(".slot");
      const bar = findBar(e.target);
      if (!slotEl || !bar) return;
      e.preventDefault();
      placeFixture(bar, Number(slotEl.dataset.slot), e.dataTransfer.getData("text/plain"));
    });

    const racks = $("#racks");
    racks.addEventListener("change", (e) => {
      const rack = findRack(e.target);
      if (!rack) return;
      const ch = rack.channels.find((c) => c.id === e.target.closest("[data-channel]")?.dataset.channel);
      const field = e.target.dataset.field;
      if (field === "name") rack.name = e.target.value.trim() || rack.name;
      if (ch && field === "size") ch.size = Number(e.target.value);
      if (ch && field === "phase") ch.phase = e.target.value;
      if (ch && field === "barId") setChannelBar(ch, e.target.value);
      persist();
    });
    racks.addEventListener("click", (e) => {
      if (!e.target.closest("[data-action='delete-rack']")) return;
      const rack = findRack(e.target);
      if (rack && confirm(`Delete rack "${rack.name}"?`)) {
        state.racks = state.racks.filter((r) => r.id !== rack.id);
        persist();
      }
    });
  }

  function bindPlot() {
    const canvas = $("#plotCanvas");

    canvas.addEventListener("pointerdown", (e) => {
      const g = e.target.closest("[data-item]");
      const item = g && state.plot.items.find((i) => i.id === g.dataset.item);
      if (!item) {
        selectedItemId = null;
        renderPlot();
        return;
      }
      selectedItemId = item.id;
      drag = { item, g, sx: e.clientX, sy: e.clientY, ox: item.x, oy: item.y, moved: false };
      g.setPointerCapture(e.pointerId);
      document.querySelectorAll(".plot-item.selected").forEach((n) => n.classList.remove("selected"));
      g.classList.add("selected");
      renderInspector(conflictIds());
      renderPatch(conflictIds());
    });

    canvas.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const dx = (e.clientX - drag.sx) / SCALE;
      const dy = (e.clientY - drag.sy) / SCALE;
      drag.item.x = clamp(snap(drag.ox + dx), 0, state.plot.widthM);
      drag.item.y = clamp(snap(drag.oy + dy), 0, state.plot.heightM);
      drag.moved = true;
      drag.g.setAttribute("transform", `translate(${drag.item.x * SCALE} ${drag.item.y * SCALE})`);
    });

    const endDrag = () => {
      if (!drag) return;
      const moved = drag.moved;
      drag = null;
      if (moved) persist();
    };
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);

    canvas.addEventListener("dragover", (e) => e.preventDefault());
    canvas.addEventListener("drop", (e) => {
      e.preventDefault();
      const svg = $("#plotSvg");
      if (!svg) return;
      const r = svg.getBoundingClientRect();
      addPlotItem(e.dataTransfer.getData("text/plain"), (e.clientX - r.left) / SCALE, (e.clientY - r.top) / SCALE);
    });

    $("#plotW").addEventListener("change", (e) => {
      state.plot.widthM = clamp(Number(e.target.value) || PLOT_CONFIG.widthM, 4, 60);
      fitItems();
      persist();
    });
    $("#plotH").addEventListener("change", (e) => {
      state.plot.heightM = clamp(Number(e.target.value) || PLOT_CONFIG.heightM, 4, 40);
      fitItems();
      persist();
    });
    $("#clearPlot").addEventListener("click", () => {
      if (confirm("Remove all fixtures from the plot?")) {
        state.plot.items = [];
        selectedItemId = null;
        persist();
      }
    });
  }

  function bindSide() {
    $("#inspector").addEventListener("change", (e) => {
      const field = e.target.dataset.field;
      const item = state.plot.items.find((i) => i.id === selectedItemId);
      if (!item || !field) return;
      const n = chCount(fixtureById(item.fixtureId));
      const v = e.target.value;
      if (field === "label") item.label = v.trim();
      if (field === "universe") item.universe = clampInt(v, 1, 16);
      if (field === "address") item.address = clampInt(v, 1, DMX_MAX - n + 1);
      if (field === "rot") item.rot = Number(v) || 0;
      if (field === "x") item.x = clamp(snap(Number(v) || 0), 0, state.plot.widthM);
      if (field === "y") item.y = clamp(snap(Number(v) || 0), 0, state.plot.heightM);
      persist();
    });

    $("#inspector").addEventListener("click", (e) => {
      if (!e.target.closest("[data-action='delete-item']")) return;
      state.plot.items = state.plot.items.filter((i) => i.id !== selectedItemId);
      selectedItemId = null;
      persist();
    });

    $("#patch").addEventListener("click", (e) => {
      const row = e.target.closest("[data-row]");
      if (!row) return;
      selectedItemId = row.dataset.row;
      renderPlot();
    });
  }

  function bindGlobal() {
    document.querySelectorAll(".view-tab").forEach((b) =>
      b.addEventListener("click", () => setView(b.dataset.view)));

    $("#customForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const d = new FormData(e.target);
      state.custom.push({
        id: "custom-" + uid(),
        brand: String(d.get("brand")).trim(),
        model: String(d.get("model")).trim(),
        type: d.get("type"),
        watts: Number(d.get("watts")),
        channels: clampInt(d.get("channels"), 1, 512),
        plug: d.get("plug"),
      });
      e.target.reset();
      persist();
    });

    $("#exportJson").addEventListener("click", () =>
      download("rig.json", JSON.stringify(state, null, 2), "application/json"));
    $("#exportCsv").addEventListener("click", () =>
      download("rig-schedule.csv", toScheduleCsv(), "text/csv"));
    $("#exportPatch").addEventListener("click", () =>
      download("rig-patch.csv", toPatchCsv(), "text/csv"));

    $("#importFile").addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          state = normalise(JSON.parse(reader.result));
          selectedItemId = null;
          persist();
        } catch {
          alert("That file isn't valid rig JSON.");
        }
      };
      reader.readAsText(file);
      e.target.value = "";
    });

    $("#resetBtn").addEventListener("click", () => {
      if (confirm("Clear the whole rig, the plot and custom fixtures?")) {
        state = normalise({});
        selectedItemId = null;
        persist();
      }
    });
  }

  // ---------- setup ----------
  function populateForms() {
    $("#customType").innerHTML = FIXTURE_TYPES.map((t) => `<option>${esc(t)}</option>`).join("");
    $("#customPlug").innerHTML = plugOptions("uk15");
    $("#barSlotPlug").innerHTML = plugOptions("uk15");
    $("#barFeedPlug").innerHTML = plugOptions("cee32");
    $("#rackSize").innerHTML = DIMMER_SIZES
      .map((s) => `<option value="${s}" ${s === 16 ? "selected" : ""}>${s} A</option>`).join("");
    $("#plotW").value = state.plot.widthM;
    $("#plotH").value = state.plot.heightM;
  }

  function populateBarForm() {
    $("#barSlotPlug").value = "uk15";
    $("#barFeedPlug").value = "cee32";
  }

  populateForms();
  bindLibrary();
  bindRig();
  bindPlot();
  bindSide();
  bindGlobal();
  setView("rig");
})();
