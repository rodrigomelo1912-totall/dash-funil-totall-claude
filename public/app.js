const currencyFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const numberFmt = new Intl.NumberFormat("pt-BR");

let RAW = null;          // dados crus do board
let FUNNEL_GROUPS = [];  // [{id, title}]
let selectedUsers = new Set(); // vazio = todos

const el = (id) => document.getElementById(id);

function fmtCurrency(v) {
  return currencyFmt.format(v || 0);
}

async function loadData(force = false) {
  el("loading-overlay").classList.remove("hidden");
  try {
    const res = await fetch(`/api/data${force ? "?force=1" : ""}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    RAW = data;
    FUNNEL_GROUPS = data.funnelGroups;
    el("board-meta").textContent = `${data.boardName} • ${numberFmt.format(data.items.length)} itens`;
    el("last-update").textContent = `Atualizado: ${new Date(data.fetchedAt * 1000).toLocaleString("pt-BR")}`;
    buildUserDropdown();
    render();
  } catch (err) {
    el("board-meta").textContent = "Erro ao carregar dados: " + err.message;
  } finally {
    el("loading-overlay").classList.add("hidden");
  }
}

function buildUserDropdown() {
  const allUsers = new Set();
  RAW.items.forEach((it) => it.responsaveis.forEach((u) => allUsers.add(u)));
  const sorted = [...allUsers].sort((a, b) => a.localeCompare(b, "pt-BR"));

  const menu = el("user-dropdown-menu");
  menu.innerHTML = "";

  const actions = document.createElement("div");
  actions.className = "dropdown-actions";
  const selectAll = document.createElement("button");
  selectAll.className = "btn-link";
  selectAll.textContent = "Selecionar todos";
  selectAll.onclick = () => {
    selectedUsers = new Set(sorted);
    syncCheckboxes();
    updateDropdownLabel();
    render();
  };
  const clearAll = document.createElement("button");
  clearAll.className = "btn-link";
  clearAll.textContent = "Limpar";
  clearAll.onclick = () => {
    selectedUsers = new Set();
    syncCheckboxes();
    updateDropdownLabel();
    render();
  };
  actions.appendChild(selectAll);
  actions.appendChild(clearAll);
  menu.appendChild(actions);

  sorted.forEach((user) => {
    const label = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = user;
    cb.checked = selectedUsers.has(user);
    cb.addEventListener("change", () => {
      if (cb.checked) selectedUsers.add(user);
      else selectedUsers.delete(user);
      updateDropdownLabel();
      render();
    });
    label.appendChild(cb);
    label.appendChild(document.createTextNode(user));
    menu.appendChild(label);
  });

  updateDropdownLabel();
}

function syncCheckboxes() {
  el("user-dropdown-menu").querySelectorAll("input[type=checkbox]").forEach((cb) => {
    cb.checked = selectedUsers.has(cb.value);
  });
}

function updateDropdownLabel() {
  const btn = el("user-dropdown-toggle");
  if (selectedUsers.size === 0) {
    btn.textContent = "Todos os responsáveis ▾";
  } else if (selectedUsers.size === 1) {
    btn.textContent = `${[...selectedUsers][0]} ▾`;
  } else {
    btn.textContent = `${selectedUsers.size} responsáveis selecionados ▾`;
  }
}

function getFilteredItems() {
  if (!RAW) return [];
  const funnelGroupIds = new Set(FUNNEL_GROUPS.map((g) => g.id));
  const from = el("filter-date-from").value;
  const to = el("filter-date-to").value;

  return RAW.items.filter((item) => {
    if (!funnelGroupIds.has(item.groupId)) return false;

    if (from || to) {
      if (!item.inicioNegociacao) return false;
      if (from && item.inicioNegociacao < from) return false;
      if (to && item.inicioNegociacao > to) return false;
    }

    if (selectedUsers.size > 0) {
      const hasMatch = item.responsaveis.some((u) => selectedUsers.has(u));
      if (!hasMatch) return false;
    }

    return true;
  });
}

function computeStageData(items) {
  const map = {};
  FUNNEL_GROUPS.forEach((g) => {
    map[g.id] = { id: g.id, title: g.title, count: 0, unico: 0, recorrente: 0, total: 0 };
  });
  items.forEach((item) => {
    const s = map[item.groupId];
    if (!s) return;
    s.count += 1;
    s.unico += item.valorUnico;
    s.recorrente += item.valorRecorrente;
    s.total += item.valorUnico + item.valorRecorrente;
  });
  return FUNNEL_GROUPS.map((g) => map[g.id]);
}

function renderFunnel(containerId, stages, valueKey, colorVar) {
  const container = document.querySelector(`#${containerId} .funnel-body`);
  container.innerHTML = "";

  const maxVal = Math.max(...stages.map((s) => s[valueKey]), 1);

  stages.forEach((stage) => {
    const value = stage[valueKey];
    const widthPct = Math.max((value / maxVal) * 100, value > 0 ? 8 : 4);

    const stageEl = document.createElement("div");
    stageEl.className = "funnel-stage";
    stageEl.dataset.stage = stage.title;

    const wrap = document.createElement("div");
    wrap.className = "funnel-bar-wrap";

    const bar = document.createElement("div");
    bar.className = "funnel-bar";
    bar.style.width = widthPct + "%";
    bar.style.background = colorVar;
    bar.textContent = `${fmtCurrency(value)} (${numberFmt.format(stage.count)})`;

    const label = document.createElement("div");
    label.className = "funnel-stage-label";
    label.textContent = stage.title;

    wrap.appendChild(bar);
    stageEl.appendChild(wrap);
    stageEl.appendChild(label);
    container.appendChild(stageEl);
  });
}

function renderTable(stages) {
  const tbody = document.querySelector("#breakdown-table tbody");
  tbody.innerHTML = "";
  const leadCount = stages.length ? stages[0].count : 0;

  stages.forEach((stage) => {
    const tr = document.createElement("tr");
    const conv = leadCount > 0 ? (stage.count / leadCount) * 100 : 0;
    tr.innerHTML = `
      <td>${stage.title}</td>
      <td>${numberFmt.format(stage.count)}</td>
      <td>${fmtCurrency(stage.unico)}</td>
      <td>${fmtCurrency(stage.recorrente)}</td>
      <td>${fmtCurrency(stage.total)}</td>
      <td>${conv.toFixed(1)}%</td>
    `;
    tbody.appendChild(tr);
  });
}

function computeCanalData(items) {
  const map = new Map();
  items.forEach((item) => {
    const key = item.canal || "Sem canal";
    if (!map.has(key)) map.set(key, { label: key, count: 0, total: 0 });
    const row = map.get(key);
    row.count += 1;
    row.total += item.valorUnico + item.valorRecorrente;
  });
  return [...map.values()].sort((a, b) => b.total - a.total);
}

function computeCalorData(items) {
  const map = new Map();
  items.forEach((item) => {
    const key = item.calor || 0;
    if (!map.has(key)) map.set(key, { label: key ? `${"★".repeat(key)} (${key})` : "Sem calor", count: 0, total: 0, order: key });
    const row = map.get(key);
    row.count += 1;
    row.total += item.valorUnico + item.valorRecorrente;
  });
  return [...map.values()].sort((a, b) => b.order - a.order);
}

function computeMonthlyData(items) {
  const map = new Map();
  items.forEach((item) => {
    if (!item.inicioNegociacao) return;
    const key = item.inicioNegociacao.slice(0, 7); // YYYY-MM
    if (!map.has(key)) map.set(key, { label: key, count: 0, total: 0 });
    const row = map.get(key);
    row.count += 1;
    row.total += item.valorUnico + item.valorRecorrente;
  });
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function renderBarChart(containerId, rows, color) {
  const container = document.querySelector(`#${containerId} .chart-body`);
  container.innerHTML = "";

  if (!rows.length) {
    container.innerHTML = '<div class="empty-state">Sem dados para os filtros selecionados.</div>';
    return;
  }

  const maxVal = Math.max(...rows.map((r) => r.total), 1);

  rows.forEach((row) => {
    const widthPct = Math.max((row.total / maxVal) * 100, row.total > 0 ? 2 : 0);

    const rowEl = document.createElement("div");
    rowEl.className = "bar-row";

    const label = document.createElement("div");
    label.className = "bar-row-label";
    label.textContent = row.label;
    label.title = row.label;

    const track = document.createElement("div");
    track.className = "bar-row-track";

    const fill = document.createElement("div");
    fill.className = "bar-row-fill";
    fill.style.width = widthPct + "%";
    fill.style.background = color;

    const value = document.createElement("div");
    value.className = "bar-row-value";
    value.textContent = `${fmtCurrency(row.total)} (${numberFmt.format(row.count)})`;

    track.appendChild(fill);
    track.appendChild(value);
    rowEl.appendChild(label);
    rowEl.appendChild(track);
    container.appendChild(rowEl);
  });
}

function render() {
  const items = getFilteredItems();
  const stages = computeStageData(items);

  const totalUnico = items.reduce((acc, i) => acc + i.valorUnico, 0);
  const totalRecorrente = items.reduce((acc, i) => acc + i.valorRecorrente, 0);

  el("kpi-unico").textContent = fmtCurrency(totalUnico);
  el("kpi-recorrente").textContent = fmtCurrency(totalRecorrente);
  el("kpi-total").textContent = fmtCurrency(totalUnico + totalRecorrente);
  el("kpi-count").textContent = numberFmt.format(items.length);

  renderFunnel("funnel-unico", stages, "unico", "var(--unico)");
  renderFunnel("funnel-recorrente", stages, "recorrente", "var(--recorrente)");
  renderFunnel("funnel-combinado", stages, "total", "var(--total)");

  renderTable(stages);

  renderBarChart("chart-canal", computeCanalData(items), "var(--accent)");
  renderBarChart("chart-calor", computeCalorData(items), "var(--total)");
  renderBarChart("chart-evolucao", computeMonthlyData(items), "var(--unico)");

  const from = el("filter-date-from").value;
  const to = el("filter-date-to").value;
  const parts = [];
  if (from || to) parts.push(`Início da Negociação: ${from || "..."} a ${to || "..."}`);
  if (selectedUsers.size > 0) parts.push(`Responsáveis: ${[...selectedUsers].join(", ")}`);
  el("filter-summary").textContent = parts.length ? `Filtros ativos — ${parts.join(" | ")}` : "Sem filtros aplicados";
}

function setupEvents() {
  el("refresh-btn").addEventListener("click", () => loadData(true));
  el("filter-date-from").addEventListener("change", render);
  el("filter-date-to").addEventListener("change", render);
  el("clear-dates").addEventListener("click", () => {
    el("filter-date-from").value = "";
    el("filter-date-to").value = "";
    render();
  });

  const toggle = el("user-dropdown-toggle");
  const menu = el("user-dropdown-menu");
  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.classList.toggle("open");
  });
  document.addEventListener("click", (e) => {
    if (!el("user-dropdown").contains(e.target)) menu.classList.remove("open");
  });
}

setupEvents();
loadData();
