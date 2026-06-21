module.exports = function handler(req, res) {
  const session = req.cookies?.dash_session || req.headers?.cookie?.match(/dash_session=([^;]+)/)?.[1];
  if (session === process.env.SESSION_SECRET) {
    return res.status(200).json({ ok: true });
  }
  return res.status(401).json({ ok: false });
};
