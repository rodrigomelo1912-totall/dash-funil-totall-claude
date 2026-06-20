const state = { items: [], board: null };
const byId = (id) => document.getElementById(id);
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const number = new Intl.NumberFormat("pt-BR");
const segments = [
  { name: "Connect", color: "#0ea5e9" },
  { name: "Select", color: "#8b5cf6" },
  { name: "Closer", color: "#f59e0b" },
  { name: "Essential", color: "#10b981" },
];
const paymentMethods = [
  { name: "Boleto", color: "#2563eb" },
  { name: "Pix", color: "#10b981" },
  { name: "Cartão", color: "#8b5cf6" },
  { name: "Ted", color: "#f59e0b" },
];
const monthNames = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

const funnelStages = [
  { name: "Lead", color: "#d9dee5", textColor: "#273142" },
  { name: "Viabilidade", color: "#667085", textColor: "#ffffff" },
  { name: "Contato", color: "#fff3bf", textColor: "#5c4813" },
  { name: "Contato 2", color: "#ffe58f", textColor: "#5c4813" },
  { name: "Contato 3", color: "#ffd666", textColor: "#5c4813" },
  { name: "Contato 4", color: "#d4a017", textColor: "#ffffff" },
  { name: "Reunião agendada", color: "#ffd6e7", textColor: "#6b2145" },
  { name: "Reunião", color: "#ffadd2", textColor: "#6b2145" },
  { name: "No Show", color: "#eb7eb7", textColor: "#ffffff" },
  { name: "Reunião Realizada", color: "#b83280", textColor: "#ffffff" },
  { name: "Proposta", color: "#91d5ff", textColor: "#164e73" },
  { name: "Proposta enviada", color: "#1677ff", textColor: "#ffffff" },
  { name: "Confecção de contrato", color: "#d3adf7", textColor: "#3b1764" },
  { name: "Contrato enviado", color: "#9254de", textColor: "#ffffff" },
  { name: "Contrato em Revisão", color: "#531dab", textColor: "#ffffff" },
  { name: "Contrato assinado", color: "#22a06b", textColor: "#ffffff" },
];

const funnelGroups = [
  { label: "Lead", color: "#8c939e", textColor: "#ffffff",
    stages: ["Lead", "Viabilidade"] },
  { label: "Contato", color: "#e8b800", textColor: "#3d2e00",
    stages: ["Contato", "Contato 2", "Contato 3", "Contato 4"] },
  { label: "Reunião", color: "#d94890", textColor: "#ffffff",
    stages: ["Reunião agendada", "Reunião", "No Show", "Reunião Realizada"] },
  { label: "Proposta", color: "#1677ff", textColor: "#ffffff",
    stages: ["Proposta", "Proposta enviada"] },
  { label: "Contrato", color: "#7c3aed", textColor: "#ffffff",
    stages: ["Confecção de contrato", "Contrato enviado", "Contrato em Revisão"] },
  { label: "Aprovado", color: "#22a06b", textColor: "#ffffff",
    stages: ["Contrato assinado"] },
];

function normalizeStage(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.\-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

function groupBy(items, key) {
  return items.reduce((groups, item) => {
    const name = item[key] || "Não informado";
    groups[name] = groups[name] || [];
    groups[name].push(item);
    return groups;
  }, {});
}

function total(items, key) {
  return items.reduce((sum, item) => sum + item[key], 0);
}

function filterItems({ dateKey = "date", includeSegment = true } = {}) {
  const from = byId("filter-date-from").value;
  const to = byId("filter-date-to").value;
  const owner = byId("filter-owner").value;
  const segment = byId("filter-segment").value;
  return state.items.filter((item) => {
    const date = item[dateKey]?.slice(0, 10);
    return (!from || (date && date >= from)) &&
      (!to || (date && date <= to)) &&
      (!owner || item.owner === owner) &&
      (!includeSegment || !segment || normalizeStage(item.segment) === normalizeStage(segment));
  });
}

function filteredItems() {
  return filterItems();
}

function approvedItems(includeSegment = true) {
  return filterItems({ dateKey: "endDate", includeSegment })
    .filter((item) => normalizeStage(item.stage) === normalizeStage("Contrato assinado"));
}

function renderFunnel(id, items, valueKey) {
  const stageMap = items.reduce((result, item) => {
    const stage = normalizeStage(item.stage);
    result[stage] = result[stage] || [];
    result[stage].push(item);
    return result;
  }, {});

  const funnelId = id.replace(/[^a-z0-9]/gi, "");

  byId(id).innerHTML = funnelGroups.map((group, gi) => {
    const allRows = group.stages.flatMap((s) => stageMap[normalizeStage(s)] || []);
    const groupValue = total(allRows, valueKey);
    const width = 100 - gi * 8;
    const expandId = `${funnelId}_g${gi}`;
    const hasChildren = group.stages.length > 1;

    const subStages = hasChildren ? group.stages.map((stageName, si) => {
      const matchingStage = funnelStages.find((fs) => normalizeStage(fs.name) === normalizeStage(stageName));
      const rows = stageMap[normalizeStage(stageName)] || [];
      const val = total(rows, valueKey);
      const subWidth = width - 2 - si * 2;
      return `<div class="funnel-step funnel-sub" style="--step-width:${subWidth}%;--step-color:${matchingStage?.color || group.color};--step-text:${matchingStage?.textColor || group.textColor}">
        <strong>${escapeHtml(stageName)}</strong>
        <span>${number.format(rows.length)} op. · ${currency.format(val)}</span>
      </div>`;
    }).join("") : "";

    return `<div class="funnel-group">
      <div class="funnel-step funnel-step-group${hasChildren ? " expandable" : ""}" style="--step-width:${width}%;--step-color:${group.color};--step-text:${group.textColor}"
        ${hasChildren ? `onclick="document.getElementById('${expandId}').classList.toggle('expanded'); this.classList.toggle('is-expanded')"` : ""}>
        ${hasChildren ? '<span class="funnel-arrow">&#9654;</span>' : ""}
        <strong>${escapeHtml(group.label)}</strong>
        <span>${number.format(allRows.length)} oportunidades · ${currency.format(groupValue)}</span>
      </div>
      ${hasChildren ? `<div class="funnel-children" id="${expandId}">${subStages}</div>` : ""}
    </div>`;
  }).join("");
}

function renderBars(id, groups, valueFn = (rows) => rows.length, format = number.format) {
  const entries = Object.entries(groups).sort((a, b) => valueFn(b[1]) - valueFn(a[1]));
  const maximum = Math.max(...entries.map(([, rows]) => valueFn(rows)), 1);
  byId(id).innerHTML = entries.length
    ? entries.map(([name, rows]) => {
      const value = valueFn(rows);
      return `<div class="bar-row"><span title="${escapeHtml(name)}">${escapeHtml(name)}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${(value / maximum) * 100}%"></div></div>
        <strong>${format(value)}</strong></div>`;
    }).join("")
    : '<span class="muted">Nenhum dado para exibir.</span>';
}

function renderFixedBars(id, items, definitions) {
  const maximum = Math.max(...definitions.map(({ name }) =>
    items.filter((item) => normalizeStage(item) === normalizeStage(name)).length), 1);
  byId(id).innerHTML = definitions.map(({ name, color }) => {
    const count = items.filter((item) => normalizeStage(item) === normalizeStage(name)).length;
    return `<div class="bar-row"><span>${escapeHtml(name)}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${(count / maximum) * 100}%;background:${color}"></div></div>
      <strong>${number.format(count)}</strong></div>`;
  }).join("");
}

function lastTwelveMonths() {
  const months = [];
  const now = new Date();
  for (let offset = 11; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    months.push({
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      label: `${monthNames[date.getMonth()]}${String(date.getFullYear()).slice(-2)}`,
    });
  }
  return months;
}

function renderMonthlyEvolution(items) {
  const months = lastTwelveMonths();
  const groups = groupBy(items.filter((item) => item.date)
    .map((item) => ({ ...item, month: item.date.slice(0, 7) })), "month");
  const values = months.map(({ key }) => total(groups[key] || [], "uniqueValue") + total(groups[key] || [], "recurringValue"));
  const maximum = Math.max(...values, 1);
  byId("chart-evolucao").innerHTML = months.map(({ label }, index) =>
    `<div class="bar-row"><span>${label}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${(values[index] / maximum) * 100}%"></div></div>
      <strong>${currency.format(values[index])}</strong></div>`).join("");
}

function renderSegmentComparison(items) {
  byId("segment-legend").innerHTML = segments.map(({ name, color }) =>
    `<span class="legend-item"><span class="legend-dot" style="--legend-color:${color}"></span>${name}</span>`).join("");

  byId("chart-segment-stages").innerHTML = funnelStages.map((stage) => {
    const counts = segments.map(({ name }) => items.filter((item) =>
      normalizeStage(item.stage) === normalizeStage(stage.name) &&
      normalizeStage(item.segment) === normalizeStage(name)).length);
    const stageTotal = counts.reduce((sum, count) => sum + count, 0);
    return `<div class="stacked-row"><span>${escapeHtml(stage.name)}</span>
      <div class="stacked-track">${segments.map(({ color }, index) => {
        const width = stageTotal ? (counts[index] / stageTotal) * 100 : 0;
        return `<span class="stacked-part" style="width:${width}%;--stack-color:${color}">${counts[index] || ""}</span>`;
      }).join("")}</div><strong>${number.format(stageTotal)}</strong></div>`;
  }).join("");
}

function renderPieChart(id, items, definitions) {
  const counts = definitions.map(({ name }) =>
    items.filter((item) => normalizeStage(item) === normalizeStage(name)).length);
  const total = counts.reduce((sum, c) => sum + c, 0) || 1;
  const pcts = counts.map((c) => ((c / total) * 100));

  let cumulativePct = 0;
  const gradientParts = [];
  definitions.forEach(({ color }, i) => {
    const start = cumulativePct;
    cumulativePct += pcts[i];
    gradientParts.push(`${color} ${start}% ${cumulativePct}%`);
  });

  const legendHtml = definitions.map(({ name, color }, i) =>
    `<div class="pie-legend-item">
      <span class="pie-legend-dot" style="background:${color}"></span>
      <span class="pie-legend-label">${escapeHtml(name)}</span>
      <strong>${pcts[i].toFixed(1)}%</strong>
      <span class="muted">(${number.format(counts[i])})</span>
    </div>`).join("");

  byId(id).innerHTML = `
    <div class="pie-wrapper">
      <div class="pie-donut" style="background:conic-gradient(${gradientParts.join(", ")})">
        <div class="pie-hole">
          <strong>${number.format(counts.reduce((a, b) => a + b, 0))}</strong>
          <span>total</span>
        </div>
      </div>
      <div class="pie-legend">${legendHtml}</div>
    </div>`;
}

function renderValueBars(id, items, definitions) {
  const rows = definitions.map(({ name, color }) => {
    const matching = items.filter((item) => normalizeStage(item.segment) === normalizeStage(name));
    const uniqueVal = matching.reduce((sum, item) => sum + item.uniqueValue, 0);
    const recurringVal = matching.reduce((sum, item) => sum + item.recurringValue, 0);
    return { name, color, count: matching.length, unique: uniqueVal, recurring: recurringVal, total: uniqueVal + recurringVal };
  });
  const maxVal = Math.max(...rows.map((r) => r.total), 1);
  byId(id).innerHTML = rows.map((row) =>
    `<div class="bar-row">
      <span title="${escapeHtml(row.name)}">${escapeHtml(row.name)}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${(row.total / maxVal) * 100}%;background:linear-gradient(90deg, ${row.color}, ${row.color}cc)"></div></div>
      <strong>${currency.format(row.total)}</strong>
    </div>`).join("") || '<span class="muted">Sem dados.</span>';
}

function addNaoInformado(itemValues, definitions) {
  const knownNames = new Set(definitions.map((d) => normalizeStage(d.name)));
  const hasUnknown = itemValues.some((v) => !knownNames.has(normalizeStage(v)));
  if (!hasUnknown) return definitions;
  return [...definitions, { name: "Não informado", color: "#94a3b8" }];
}

function renderApproved(items, comparisonItems) {
  const combined = (item) => item.uniqueValue + item.recurringValue;
  byId("approved-summary").textContent = `${number.format(items.length)} aprovados · ${currency.format(items.reduce((sum, item) => sum + combined(item), 0))}`;
  const segDefs = addNaoInformado(comparisonItems.map((i) => i.segment), segments);
  renderPieChart("approved-segments-pie", comparisonItems.map((item) => item.segment), segDefs);
  renderValueBars("approved-segments-bars", comparisonItems, segDefs);
  const personDefs = addNaoInformado(items.map((i) => i.personType), [
    { name: "Pessoa física", color: "#9b59b6" },
    { name: "Pessoa jurídica", color: "#1a3a5c" },
  ]);
  renderPieChart("approved-person-types", items.map((item) => item.personType), personDefs);

  const installmentRows = Array.from({ length: 12 }, (_, index) => {
    const installment = index + 1;
    const rows = items.filter((item) => item.installments === installment);
    return { installment, count: rows.length, value: rows.reduce((sum, item) => sum + combined(item), 0) };
  });
  const maxCount = Math.max(...installmentRows.map((row) => row.count), 1);
  const maxValue = Math.max(...installmentRows.map((row) => row.value), 1);
  byId("approved-installments").innerHTML = installmentRows.map((row) =>
    `<div class="dual-row"><strong>${row.installment}x</strong>
      <div class="dual-track"><div class="dual-fill" style="--bar-width:${(row.count / maxCount) * 100}%;--bar-color:#0ea5e9"></div><span class="dual-value">${row.count} itens</span></div>
      <div class="dual-track"><div class="dual-fill" style="--bar-width:${(row.value / maxValue) * 100}%;--bar-color:#10b981"></div><span class="dual-value">${currency.format(row.value)}</span></div>
    </div>`).join("");

  const payDefs = addNaoInformado(items.map((i) => i.paymentMethod), paymentMethods);
  const paymentCounts = payDefs.map(({ name }) =>
    items.filter((item) => normalizeStage(item.paymentMethod) === normalizeStage(name)).length);
  const paymentTotal = paymentCounts.reduce((sum, count) => sum + count, 0);
  byId("approved-payments").innerHTML = payDefs.map(({ name, color }, index) => {
    const share = paymentTotal ? (paymentCounts[index] / paymentTotal) * 100 : 25;
    return `<div class="share-part" style="--share-width:${share}%;--share-color:${color}">
      <strong>${name}</strong><span>${paymentCounts[index]} · ${paymentTotal ? share.toFixed(1) : "0.0"}%</span>
    </div>`;
  }).join("");
}

function renderTable(items) {
  const groups = Object.entries(groupBy(items, "stage"));
  const leadCount = groups.find(([stage]) => stage.toLocaleLowerCase("pt-BR").includes("lead"))?.[1].length || 0;
  byId("breakdown-table").querySelector("tbody").innerHTML = groups.map(([stage, rows]) => {
    const unique = total(rows, "uniqueValue");
    const recurring = total(rows, "recurringValue");
    const conversion = leadCount ? `${((rows.length / leadCount) * 100).toFixed(1)}%` : "-";
    return `<tr><td>${escapeHtml(stage)}</td><td>${number.format(rows.length)}</td>
      <td>${currency.format(unique)}</td><td>${currency.format(recurring)}</td>
      <td>${currency.format(unique + recurring)}</td><td>${conversion}</td></tr>`;
  }).join("");
}

function render() {
  const items = filteredItems();
  const unique = total(items, "uniqueValue");
  const recurring = total(items, "recurringValue");
  byId("kpi-unico").textContent = currency.format(unique);
  byId("kpi-recorrente").textContent = currency.format(recurring);
  byId("kpi-total").textContent = currency.format(unique + recurring);
  byId("kpi-count").textContent = number.format(items.length);
  const hasFilters = byId("filter-date-from").value || byId("filter-date-to").value || byId("filter-owner").value || byId("filter-segment").value;
  byId("filter-summary").textContent = hasFilters
    ? `${items.length} de ${state.items.length} oportunidades`
    : `${items.length} oportunidades`;
  document.querySelector(".filters").classList.toggle("has-filters", !!hasFilters);

  renderFunnel("funnel-unico", items, "uniqueValue");
  renderFunnel("funnel-recorrente", items, "recurringValue");
  renderFunnel("funnel-combinado", items.map((item) => ({ ...item, combined: item.uniqueValue + item.recurringValue })), "combined");
  renderBars("chart-canal", groupBy(items, "channel"));
  renderBars("chart-calor", groupBy(items, "heat"));

  renderMonthlyEvolution(items);
  renderTable(items);
  renderSegmentComparison(filterItems({ includeSegment: false }));
  renderApproved(approvedItems(), approvedItems(false));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[char]);
}

async function loadData() {
  byId("loading-overlay").classList.remove("hidden");
  try {
    const response = await fetch("/api/monday");
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      throw new Error("API indisponível. Publique na Vercel ou execute com `vercel dev`.");
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || data.error);
    state.items = data.items;
    state.board = data.board;
    byId("board-meta").textContent = `${data.board.name} · ${data.items.length} itens`;
    const updateText = `Atualizado às ${new Date(data.fetchedAt).toLocaleTimeString("pt-BR")}`;
    byId("last-update").textContent = updateText;
    const footerEl = byId("footer-update");
    if (footerEl) footerEl.textContent = updateText;

    const ownerSelect = byId("filter-owner");
    const selected = ownerSelect.value;
    const owners = [...new Set(state.items.map((item) => item.owner))].sort();
    ownerSelect.innerHTML = '<option value="">Todos os responsáveis</option>' +
      owners.map((owner) => `<option value="${escapeHtml(owner)}">${escapeHtml(owner)}</option>`).join("");
    ownerSelect.value = selected;
    render();
  } catch (error) {
    byId("board-meta").innerHTML = `<span class="error">${escapeHtml(error.message)}</span>`;
  } finally {
    byId("loading-overlay").classList.add("hidden");
  }
}

byId("export-btn").addEventListener("click", () => {
  const items = filteredItems();
  const header = ["Nome", "Etapa", "Responsável", "Canal", "Segmentação", "Calor", "Valor Único", "Valor Recorrente", "Total", "Início Negociação"];
  const rows = items.map((item) => [
    item.name,
    item.stage,
    item.owner,
    item.channel,
    item.segment,
    item.heat,
    item.uniqueValue,
    item.recurringValue,
    item.uniqueValue + item.recurringValue,
    item.date || "",
  ]);
  const csvContent = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";"))
    .join("\n");
  const bom = "﻿";
  const blob = new Blob([bom + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const now = new Date();
  a.download = `funil-vendas-${now.toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});
byId("refresh-btn").addEventListener("click", loadData);
byId("filter-date-from").addEventListener("change", render);
byId("filter-date-to").addEventListener("change", render);
byId("filter-owner").addEventListener("change", render);
byId("filter-segment").addEventListener("change", render);
byId("clear-dates").addEventListener("click", () => {
  byId("filter-date-from").value = "";
  byId("filter-date-to").value = "";
  render();
});

loadData();
