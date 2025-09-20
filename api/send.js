// api/send.js
import crypto from 'crypto';

// bodyParserを切る（速度とraw取得のため。検証だけなら必須ではないが癖を揃える）
export const config = { api: { bodyParser: false } };

const readRaw = (req) =>
  new Promise((resolve, reject) => {
    let d = ''; 
    req.on('data', c => d += c);
    req.on('end', () => resolve(d)); 
    req.on('error', reject);
  });

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end('NG');

  const raw = await readRaw(req);
  let body = {};
  try { 
    body = JSON.parse(raw || '{}'); 
  } catch {}

  // ★URL検証だけ確実に返す（署名など他のチェックは後で）
  if (body?.event === 'endpoint.url_validation' && body?.payload?.plainToken) {
    const plain = String(body.payload.plainToken);
    const enc = crypto.createHmac('sha256', process.env.ZOOM_WEBHOOK_SECRET_TOKEN)
                      .update(plain).digest('hex');
    return res.status(200).json({ plainToken: plain, encryptedToken: enc });
  }

  // 以降は本番イベント。まずは200を即返し、後で署名検証を足す
  try {
    const GAS_URL = process.env.GAS_ENDPOINT_URL;
    if (!GAS_URL) return res.status(500).json({ error: 'GAS_ENDPOINT_URL is not set' });

    // ZoomAPIからのWebhookデータをログ出力（デバッグ用）
    console.log('Received Zoom Webhook Data:', JSON.stringify(body, null, 2));

    // Webhookデータの基本的な検証
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'Invalid webhook data' });
    }

    const response = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'Vercel-Zoom-Webhook-Relay/1.0'
      },
      body: JSON.stringify(body),
    });

    // GASからのレスポンスを処理
    let gasResponseBody;
    const responseText = await response.text();
    try { 
      gasResponseBody = JSON.parse(responseText); 
    } catch { 
      gasResponseBody = responseText; 
    }

    // 成功時のログ出力
    if (response.ok) {
      console.log('Successfully sent to GAS:', response.status);
    } else {
      console.error('GAS responded with error:', response.status, gasResponseBody);
    }

    return res.status(response.ok ? 200 : response.status).json({
      success: response.ok,
      status: response.status,
      gasResponse: gasResponseBody,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error processing Zoom webhook:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
