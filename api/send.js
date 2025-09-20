// api/send.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const GAS_URL = process.env.GAS_ENDPOINT_URL; // 例: https://script.google.com/macros/s/xxxx/exec
    if (!GAS_URL) return res.status(500).json({ error: 'GAS_ENDPOINT_URL is not set' });

    // ZoomAPIからのWebhookデータをログ出力（デバッグ用）
    console.log('Received Zoom Webhook Data:', JSON.stringify(req.body, null, 2));

    // ZoomAPIのWebhookデータをそのままGASに送信
    const webhookData = req.body;
    
    // Webhookデータの基本的な検証
    if (!webhookData || typeof webhookData !== 'object') {
      return res.status(400).json({ error: 'Invalid webhook data' });
    }

    const response = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'Vercel-Zoom-Webhook-Relay/1.0'
      },
      body: JSON.stringify(webhookData),
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
