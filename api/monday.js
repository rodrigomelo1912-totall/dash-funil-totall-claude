const MONDAY_ENDPOINT = "https://api.monday.com/v2";
const PAGE_SIZE = 500;

const configuredColumns = {
  stage: process.env.MONDAY_STAGE_COLUMN_ID,
  date: process.env.MONDAY_DATE_COLUMN_ID,
  owner: process.env.MONDAY_OWNER_COLUMN_ID,
  uniqueValue: process.env.MONDAY_UNIQUE_VALUE_COLUMN_ID,
  recurringValue: process.env.MONDAY_RECURRING_VALUE_COLUMN_ID,
  channel: process.env.MONDAY_CHANNEL_COLUMN_ID,
  heat: process.env.MONDAY_HEAT_COLUMN_ID,
  segment: process.env.MONDAY_SEGMENT_COLUMN_ID,
  endDate: process.env.MONDAY_END_DATE_COLUMN_ID,
  personType: process.env.MONDAY_PERSON_TYPE_COLUMN_ID,
  installments: process.env.MONDAY_INSTALLMENTS_COLUMN_ID,
  paymentMethod: process.env.MONDAY_PAYMENT_METHOD_COLUMN_ID,
  taxId: process.env.MONDAY_TAX_ID_COLUMN_ID,
};

const columnTitleCandidates = {
  stage: ["etapa", "fase", "status"],
  date: ["inicio da negociacao", "inicio negociacao", "data da negociacao"],
  owner: ["responsavel", "proprietario", "owner"],
  uniqueValue: ["valor unico", "valor unitario", "unico"],
  recurringValue: ["valor recorrente", "recorrente", "mensalidade"],
  channel: ["canal", "origem"],
  heat: ["calor", "temperatura"],
  segment: ["segmentacao", "segmento"],
  endDate: ["fim da negociacao", "data fim da negociacao", "fim negociacao"],
  personType: ["tipo", "tipo pessoa", "tipo de pessoa"],
  installments: ["qtde parc", "qtd parc", "quantidade parcelas", "parcelas"],
  paymentMethod: ["forma de pgto", "forma de pagto", "forma de pagamento", "pagamento"],
  taxId: ["cpf/cnpj"],
};

function normalizeTitle(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function resolveColumns(boardColumns) {
  const byTitle = boardColumns.map((column) => ({
    id: column.id,
    title: normalizeTitle(column.title),
    type: column.type,
  }));

  return Object.fromEntries(Object.entries(columnTitleCandidates).map(([key, candidates]) => {
    if (configuredColumns[key]) return [key, configuredColumns[key]];
    const candidatesByType = key === "taxId"
      ? [...byTitle].sort((a, b) => Number(a.type === "mirror") - Number(b.type === "mirror"))
      : byTitle;
    const match = candidatesByType.find((column) => candidates.some((candidate) => column.title === candidate))
      || byTitle.find((column) => candidates.some((candidate) => column.title.includes(candidate)));
    return [key, match?.id];
  }));
}

async function mondayRequest(query, variables) {
  const response = await fetch(MONDAY_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: process.env.MONDAY_API_TOKEN,
      "Content-Type": "application/json",
      "API-Version": "2026-04",
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = await response.json();
  if (!response.ok || body.errors) {
    throw new Error(body.errors?.[0]?.message || `Monday respondeu com HTTP ${response.status}`);
  }
  return body.data;
}

const itemFields = `
  id
  name
  group { id title }
  column_values {
    id
    text
    value
    ... on MirrorValue { display_value }
  }
`;

function normalizeItem(item, columns) {
  const values = Object.fromEntries(item.column_values.map((column) => [column.id, column]));
  const text = (key) => values[columns[key]]?.text?.trim() || values[columns[key]]?.display_value?.trim() || "";
  const money = (key) => {
    const raw = text(key).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
    return Number(raw) || 0;
  };

  const personType = text("personType");
  const taxIdDigits = text("taxId").replace(/\D/g, "");
  const inferredPersonType = taxIdDigits.length === 11
    ? "Pessoa física"
    : taxIdDigits.length === 14 ? "Pessoa jurídica" : "";

  return {
    id: item.id,
    name: item.name,
    group: item.group?.title || "",
    stage: text("stage") || item.group?.title || "Sem etapa",
    date: text("date"),
    owner: text("owner") || "Sem responsável",
    uniqueValue: money("uniqueValue"),
    recurringValue: money("recurringValue"),
    channel: text("channel") || "Não informado",
    heat: text("heat") || "Não informado",
    segment: text("segment") || "Não informado",
    endDate: text("endDate"),
    personType: personType || inferredPersonType || "Não informado",
    installments: Number(text("installments").replace(/\D/g, "")) || 0,
    paymentMethod: text("paymentMethod") || "Não informado",
  };
}

async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Método não permitido." });
  }

  if (!process.env.MONDAY_API_TOKEN || !process.env.MONDAY_BOARD_ID) {
    return response.status(500).json({ error: "Configure MONDAY_API_TOKEN e MONDAY_BOARD_ID na Vercel." });
  }

  try {
    const firstQuery = `query ($boardIds: [ID!]!, $limit: Int!) {
      boards(ids: $boardIds) {
        id
        name
        columns { id title type }
        items_page(limit: $limit) { cursor items { ${itemFields} } }
      }
    }`;
    const firstData = await mondayRequest(firstQuery, {
      boardIds: [process.env.MONDAY_BOARD_ID],
      limit: PAGE_SIZE,
    });
    const board = firstData.boards?.[0];
    if (!board) return response.status(404).json({ error: "Board não encontrado ou sem permissão." });
    const columns = resolveColumns(board.columns);
    const items = [...board.items_page.items];
    let cursor = board.items_page.cursor;
    const nextQuery = `query ($cursor: String!, $limit: Int!) {
      next_items_page(cursor: $cursor, limit: $limit) { cursor items { ${itemFields} } }
    }`;

    while (cursor) {
      const nextData = await mondayRequest(nextQuery, { cursor, limit: PAGE_SIZE });
      items.push(...nextData.next_items_page.items);
      cursor = nextData.next_items_page.cursor;
    }

    response.setHeader("Cache-Control", "private, no-store");
    return response.status(200).json({
      board: { id: board.id, name: board.name },
      items: items.map((item) => normalizeItem(item, columns)),
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error(error);
    return response.status(502).json({ error: "Não foi possível consultar o Monday.", detail: error.message });
  }
}

module.exports = handler;
