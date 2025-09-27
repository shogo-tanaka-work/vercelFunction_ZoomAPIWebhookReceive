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

// GASへのリクエストを非同期で実行する関数（Fire-and-Forget方式）
const sendToGasFireAndForget = (webhookData) => {
  const GAS_URL = process.env.GAS_ENDPOINT_URL;
  if (!GAS_URL) {
    console.error('GAS_ENDPOINT_URL is not set');
    return;
  }

  fetch(GAS_URL, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'User-Agent': 'Vercel-Zoom-Webhook-Relay/1.0'
    },
    body: JSON.stringify(webhookData),
  })
  .then(async response => {
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
  })
  .catch(error => {
    console.error('Error sending webhook to GAS:', error.message);
  });
};

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

  // 以降は本番イベント。まず200を即返し、GAS処理は非同期で実行
  // Webhookデータの基本的な検証
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Invalid webhook data' });
  }

  // ZoomAPIからのWebhookデータをログ出力（デバッグ用）
  console.log('Received Zoom Webhook Data:', JSON.stringify(body, null, 2));

  // ★ まず200レスポンスを即座に返す（Zoomのリトライを防ぐため）
  res.status(200).json({ 
    success: true, 
    message: 'Webhook received and queued for processing',
    timestamp: new Date().toISOString()
  });

  // GAS処理を非同期で実行（awaitしない）
  sendToGasFireAndForget(body);
}
