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

// GASへのリクエストを同期的に実行する関数
const sendToGas = async (webhookData) => {

  console.log('GAS_ENDPOINT_URL:', process.env.GAS_ENDPOINT_URL);
  const GAS_URL = process.env.GAS_ENDPOINT_URL;
  if (!GAS_URL) {
    console.error('GAS_ENDPOINT_URL is not set');
    throw new Error('GAS_ENDPOINT_URL is not set');
  }

  console.log('GAS送信処理開始');
  
  try {
    const response = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'Vercel-Zoom-Webhook-Relay/1.0'
      },
      body: JSON.stringify(webhookData),
    });

    console.log('GASからのレスポンス取得');
    
    // GASからのレスポンスを処理
    let gasResponseBody;
    const responseText = await response.text();
    try { 
      gasResponseBody = JSON.parse(responseText); 
    } catch { 
      gasResponseBody = responseText; 
    }

    console.log('GASからのレスポンス処理完了');

    // 成功時のログ出力
    if (response.ok) {
      console.log('Successfully sent to GAS:', response.status);
      return { success: true, status: response.status, body: gasResponseBody };
    } else {
      console.error('GAS responded with error:', response.status, gasResponseBody);
      return { success: false, status: response.status, body: gasResponseBody };
    }
  } catch (error) {
    console.error('Error sending webhook to GAS:', error.message);
    throw error;
  }
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

  // 以降は本番イベント。GAS処理を同期的に実行してから200を返す
  // Webhookデータの基本的な検証
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Invalid webhook data' });
  }

  // リクエストヘッダーをログ出力（デバッグ用）
  console.log('Received Zoom Webhook Headers:', JSON.stringify(req.headers, null, 2));
  
  // Zoom関連の重要なヘッダーを抽出してログ出力
  const zoomHeaders = {
    'x-zm-trackingid': req.headers['x-zm-trackingid'],
    'x-zoom-retry-num': req.headers['x-zoom-retry-num'],
    'x-zm-signature': req.headers['x-zm-signature'],
    'x-zm-request-timestamp': req.headers['x-zm-request-timestamp'],
    'user-agent': req.headers['user-agent'],
    'content-type': req.headers['content-type']
  };
  console.log('Zoom Specific Headers:', JSON.stringify(zoomHeaders, null, 2));
  
  // ZoomAPIからのWebhookデータをログ出力（デバッグ用）
  console.log('Received Zoom Webhook Data:', JSON.stringify(body, null, 2));

  try {
    // GAS処理を同期的に実行（完了を待つ）
    const gasResult = await sendToGas(body);
    
    console.log('GAS処理が完了しました');
    
    // GAS処理の完了後に200レスポンスを返す
    res.status(200).json({ 
      success: true, 
      message: 'Webhook received and processed',
      timestamp: new Date().toISOString(),
      gasStatus: gasResult.status
    });
  } catch (error) {
    console.error('GAS処理でエラーが発生しました:', error.message);
    
    // エラーが発生しても200を返す（Zoomのリトライを防ぐため）
    res.status(200).json({ 
      success: false, 
      message: 'Webhook received but processing failed',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
}
