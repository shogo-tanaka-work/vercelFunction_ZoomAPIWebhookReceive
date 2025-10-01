import { Receiver } from '@upstash/qstash';

export const config = { api: { bodyParser: false } };

// リクエストボディを読み取る
const readRaw = (req) =>
  new Promise((resolve, reject) => {
    let d = ''; 
    req.on('data', c => d += c);
    req.on('end', () => resolve(d)); 
    req.on('error', reject);
  });

// GASへの送信処理
async function sendToGas(webhookData) {
  const GAS_URL = process.env.GAS_ENDPOINT_URL;
  
  if (!GAS_URL) {
    throw new Error('GAS_ENDPOINT_URL is not set');
  }

  console.log('📤 GAS送信開始:', new Date().toISOString());
  const startTime = Date.now();

  try {
    const response = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'Vercel-QStash-Relay/1.0'
      },
      body: JSON.stringify(webhookData),
    });

    const elapsed = Date.now() - startTime;
    console.log(`📥 GASレスポンス受信 (${elapsed}ms):`, response.status);
    
    const responseText = await response.text();
    let gasResponseBody;
    try { 
      gasResponseBody = JSON.parse(responseText); 
    } catch { 
      gasResponseBody = responseText; 
    }

    if (response.ok) {
      console.log(`✅ GAS処理成功 (${elapsed}ms)`);
      return { 
        success: true, 
        status: response.status, 
        body: gasResponseBody,
        duration: elapsed 
      };
    } else {
      console.error(`❌ GASエラーレスポンス (${elapsed}ms):`, response.status);
      throw new Error(`GAS error: ${response.status} - ${JSON.stringify(gasResponseBody)}`);
    }
    
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`❌ GAS送信エラー (${elapsed}ms):`, error.message);
    throw error;
  }
}

// メインハンドラー
export default async function handler(req, res) {
  console.log('\n' + '='.repeat(60));
  console.log('🔧 バックグラウンド処理開始:', new Date().toISOString());
  console.log('='.repeat(60));
  
  if (req.method !== 'POST') {
    console.log('❌ メソッド不正:', req.method);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ★QStashからの署名検証（セキュリティ対策）
  const rawBody = await readRaw(req);
  
  if (process.env.QSTASH_CURRENT_SIGNING_KEY && process.env.QSTASH_NEXT_SIGNING_KEY) {
    try {
      const receiver = new Receiver({
        currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY,
        nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY,
      });

      const signature = req.headers['upstash-signature'];
      if (!signature) {
        console.error('❌ QStash署名が見つかりません');
        return res.status(401).json({ error: 'Missing signature' });
      }

      await receiver.verify({
        signature,
        body: rawBody,
      });
      
      console.log('✅ QStash署名検証成功');
    } catch (error) {
      console.error('❌ QStash署名検証失敗:', error.message);
      return res.status(401).json({ error: 'Invalid signature' });
    }
  } else {
    console.warn('⚠️ QStash署名検証がスキップされました（環境変数未設定）');
  }

  // リクエストボディのパース
  let body = {};
  try {
    body = JSON.parse(rawBody || '{}');
  } catch (e) {
    console.error('❌ JSONパースエラー:', e.message);
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const { webhookData, trackingId, receivedAt, requestId } = body;

  console.log('📊 処理情報:');
  console.log('  - RequestID:', requestId);
  console.log('  - TrackingID:', trackingId);
  console.log('  - 受信時刻:', receivedAt);
  console.log('  - イベント:', webhookData?.event);

  try {
    // ★時間制限なしでGAS処理を実行
    const result = await sendToGas(webhookData);
    
    console.log('='.repeat(60));
    console.log(`✅ 処理完了 [${requestId}]`);
    console.log(`  - GAS処理時間: ${result.duration}ms`);
    console.log(`  - GASステータス: ${result.status}`);
    console.log('='.repeat(60) + '\n');
    
    // QStashに成功を通知
    return res.status(200).json({ 
      success: true,
      trackingId: trackingId,
      duration: result.duration
    });
    
  } catch (error) {
    console.error('='.repeat(60));
    console.error(`❌ 処理失敗 [${requestId}]`);
    console.error(`  - エラー: ${error.message}`);
    console.error('='.repeat(60) + '\n');
    
    // ★エラーを返すとQStashが自動リトライ（最大3回）
    return res.status(500).json({ 
      error: error.message,
      trackingId: trackingId
    });
  }
}