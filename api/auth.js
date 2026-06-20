module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método não permitido" });
  }

  let body = "";
  for await (const chunk of req) body += chunk;

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return res.status(400).json({ error: "JSON inválido" });
  }

  const validUser = process.env.AUTH_USER;
  const validPass = process.env.AUTH_PASS;
  const sessionSecret = process.env.SESSION_SECRET;

  if (!validUser || !validPass || !sessionSecret) {
    return res.status(500).json({ error: "Variáveis de autenticação não configuradas" });
  }

  if (parsed.user === validUser && parsed.pass === validPass) {
    res.setHeader("Set-Cookie", `dash_session=${sessionSecret}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`);
    return res.status(200).json({ ok: true });
  }

  return res.status(401).json({ error: "Usuário ou senha incorretos" });
};
