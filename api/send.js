// api/send.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const GAS_URL = process.env.GAS_ENDPOINT_URL; // 例: https://script.google.com/macros/s/xxxx/exec
    if (!GAS_URL) return res.status(500).json({ error: 'GAS_ENDPOINT_URL is not set' });

    // そのまま中継してOK（例: { uuid, message }）
    const response = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body ?? {}),
    });

    // GASがJSON返す前提。テキストの場合も吸収
    let body;
    const text = await response.text();
    try { body = JSON.parse(text); } catch { body = text; }

    return res.status(response.ok ? 200 : response.status).json({
      ok: response.ok,
      status: response.status,
      gas: body,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
