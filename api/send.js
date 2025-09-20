const crypto = require('crypto');

// bodyParserを切る（raw取得のため）
export const config = { api: { bodyParser: false } };

const readRaw = (req) =>
  new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // rawボディを取得
    const raw = await readRaw(req);
    let body = {};
    
    try {
      body = JSON.parse(raw || '{}');
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      return res.status(400).json({ error: 'Invalid JSON' });
    }

    console.log('Received Zoom Webhook Data:', JSON.stringify(body, null, 2));

    // ★ URL検証処理（最優先）
    if (body?.event === 'endpoint.url_validation' && body?.payload?.plainToken) {
      const plainToken = String(body.payload.plainToken);
      const secretToken = process.env.ZOOM_WEBHOOK_SECRET_TOKEN;
      
      if (!secretToken) {
        console.error('ZOOM_WEBHOOK_SECRET_TOKEN is not set');
        return res.status(500).json({ error: 'Secret token not configured' });
      }

      // HMAC-SHA256で暗号化
      const encryptedToken = crypto
        .createHmac('sha256', secretToken)
        .update(plainToken)
        .digest('hex');

      console.log('URL Validation - plainToken:', plainToken);
      console.log('URL Validation - encryptedToken:', encryptedToken);

      // Zoomが期待する形式で返却
      return res.status(200).json({
        plainToken: plainToken,
        encryptedToken: encryptedToken
      });
    }

    // 本番イベント処理
    const GAS_URL = process.env.GAS_ENDPOINT_URL;
    if (!GAS_URL) {
      console.error('GAS_ENDPOINT_URL is not set');
      return res.status(500).json({ error: 'GAS_ENDPOINT_URL is not set' });
    }

    // Webhookデータの基本的な検証
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'Invalid webhook data' });
    }

    // 署名検証（本番イベント用）
    const signature = req.headers['x-zm-signature'];
    const timestamp = req.headers['x-zm-request-timestamp'];
    
    if (signature && timestamp) {
      const secretToken = process.env.ZOOM_WEBHOOK_SECRET_TOKEN;
      if (secretToken) {
        const message = `v0:${timestamp}:${raw}`;
        const expectedSignature = crypto
          .createHmac('sha256', secretToken)
          .update(message)
          .digest('hex');
        
        const expectedSignatureWithPrefix = `v0=${expectedSignature}`;
        
        if (signature !== expectedSignatureWithPrefix) {
          console.error('Signature verification failed');
          console.error('Expected:', expectedSignatureWithPrefix);
          console.error('Received:', signature);
          return res.status(401).json({ error: 'Signature verification failed' });
        }
        
        console.log('Signature verification successful');
      }
    }

    // GASに送信
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
      error: error?.message || 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
}
