const https = require("https");

const BOARD_ID = 9296990987;
const COLUMN_IDS = [
  "color_mkrjsyfh",
  "numeric_mkrjm7r2",
  "numeric_mkswt1eb",
  "multiple_person_mkrkp1za",
  "date_mkt2rybk",
  "color_mks7pj62",
  "rating_mkrjygra",
];
const FUNNEL_GROUPS = [
  { id: "topics", title: "Lead" },
  { id: "group_mm3ynkak", title: "EM CONTATO" },
  { id: "group_mm3y5m94", title: "REUNIÃO" },
  { id: "group_mm3yvr2h", title: "PROPOSTA" },
  { id: "group_mm3yfd7x", title: "CONTRATO" },
  { id: "group_title", title: "APROVADA" },
  { id: "group_mkrkws0k", title: "REPROVADA" },
];

function graphql(token, query) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query });
    const req = https.request(
      {
        hostname: "api.monday.com",
        path: "/v2",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token,
          "API-Version": "2024-10",
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.errors) reject(new Error(JSON.stringify(parsed.errors)));
            else resolve(parsed.data);
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function parseNum(text) {
  if (!text) return 0;
  try {
    return parseFloat(text.replace(/\./g, "").replace(",", ".")) || 0;
  } catch {
    return 0;
  }
}

function parseItem(item) {
  const cols = {};
  item.column_values.forEach((c) => (cols[c.id] = c));
  const text = (id) => (cols[id] && cols[id].text) || "";
  const people = (id) => {
    const t = text(id).trim();
    return t ? t.split(",").map((n) => n.trim()).filter(Boolean) : [];
  };
  const calor = text("rating_mkrjygra");

  return {
    id: item.id,
    name: item.name,
    groupId: item.group.id,
    groupTitle: item.group.title,
    etapa: text("color_mkrjsyfh"),
    valorUnico: parseNum(text("numeric_mkrjm7r2")),
    valorRecorrente: parseNum(text("numeric_mkswt1eb")),
    responsaveis: people("multiple_person_mkrkp1za"),
    inicioNegociacao: text("date_mkt2rybk") || null,
    canal: text("color_mks7pj62") || null,
    calor: /^\d+$/.test(calor) ? parseInt(calor) : null,
  };
}

async function fetchBoard(token) {
  const colIds = JSON.stringify(COLUMN_IDS);

  const firstQuery = `query {
    boards(ids: [${BOARD_ID}]) {
      name
      groups { id title }
      items_page(limit: 500) {
        cursor
        items {
          id name
          group { id title }
          column_values(ids: ${colIds}) { id text value }
        }
      }
    }
  }`;

  const data = await graphql(token, firstQuery);
  const board = data.boards[0];
  const items = board.items_page.items.map(parseItem);
  let cursor = board.items_page.cursor;

  while (cursor) {
    const nextQuery = `query {
      next_items_page(limit: 500, cursor: "${cursor}") {
        cursor
        items {
          id name
          group { id title }
          column_values(ids: ${colIds}) { id text value }
        }
      }
    }`;
    const next = await graphql(token, nextQuery);
    items.push(...next.next_items_page.items.map(parseItem));
    cursor = next.next_items_page.cursor;
  }

  return {
    boardName: board.name,
    fetchedAt: Math.floor(Date.now() / 1000),
    groups: board.groups,
    funnelGroups: FUNNEL_GROUPS,
    items,
  };
}

module.exports = async function handler(req, res) {
  const token = process.env.MONDAY_TOKEN;
  if (!token) {
    return res.status(500).json({ error: "MONDAY_TOKEN env var not set" });
  }
  try {
    const result = await fetchBoard(token);
    res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=60");
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
