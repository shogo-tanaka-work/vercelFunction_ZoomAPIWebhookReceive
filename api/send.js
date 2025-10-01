import crypto from 'crypto';
import { Client } from '@upstash/qstash';

export const config = { api: { bodyParser: false } };

const readRaw = (req) =>
  new Promise((resolve, reject) => {
    let d = ''; 
    req.on('data', c => d += c);
    req.on('end', () => resolve(d)); 
    req.on('error', reject);
  });

// QStashクライアント初期化
const qstashClient = new Client({
  token: process.env.QSTASH_TOKEN,
});

export default async function handler(req, res) {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(7);
  
  console.log('\n' + '='.repeat(60));
  console.log(`🔔 Webhook受信 [${requestId}]`, new Date().toISOString());
  console.log('='.repeat(60));
  
  if (req.method !== 'POST') {
    console.log('❌ メソッド不正:', req.method);
    return res.status(405).end('NG');
  }

  const raw = await readRaw(req);
  let body = {};
  try { 
    body = JSON.parse(raw || '{}'); 
  } catch (e) {
    console.error('❌ JSONパースエラー:', e.message);
  }

  // URL検証（そのまま）
  if (body?.event === 'endpoint.url_validation' && body?.payload?.plainToken) {
    const plain = String(body.payload.plainToken);
    const enc = crypto.createHmac('sha256', process.env.ZOOM_WEBHOOK_SECRET_TOKEN)
                      .update(plain).digest('hex');
    console.log('✅ URL検証レスポンス送信');
    return res.status(200).json({ plainToken: plain, encryptedToken: enc });
  }

  // データ検証
  if (!body || typeof body !== 'object') {
    console.error('❌ 不正なWebhookデータ');
    return res.status(400).json({ error: 'Invalid webhook data' });
  }

  // Zoomヘッダー情報
  const trackingId = req.headers['x-zm-trackingid'];
  const retryNum = req.headers['x-zoom-retry-num'];
  
  console.log('📊 診断情報:');
  console.log('  - TrackingID:', trackingId || 'なし');
  console.log('  - リトライ回数:', retryNum ? `${retryNum}回目` : '初回');
  console.log('  - イベントタイプ:', body.event || '不明');
  
  if (retryNum) {
    console.warn('⚠️⚠️⚠️ これはZoomからのリトライです！ ⚠️⚠️⚠️');
  }

  try {
    // ★QStashにキューイング（超高速 < 100ms）
    console.log('📤 QStashキューイング開始');
    
    // 処理用エンドポイントのURL構築
    const processUrl = `https://${req.headers.host}/api/process-gas`;
    
    const result = await qstashClient.publishJSON({
      url: processUrl,
      body: {
        webhookData: body,
        trackingId: trackingId,
        receivedAt: new Date().toISOString(),
        requestId: requestId
      },
      retries: 3, // QStash側で3回リトライ
      // delay: 0 // 即座に処理（デフォルト）
    });

    const elapsed = Date.now() - startTime;
    
    console.log('='.repeat(60));
    console.log(`✅ キューイング成功 [${requestId}]`);
    console.log(`  - 処理時間: ${elapsed}ms`);
    console.log(`  - QStash MessageID: ${result.messageId}`);
    console.log(`  - TrackingID: ${trackingId}`);
    console.log('='.repeat(60) + '\n');

    // ★Zoomに即座に200を返す（3秒以内確実）
    return res.status(200).json({
      success: true,
      message: 'Webhook queued for processing',
      messageId: result.messageId,
      trackingId: trackingId,
      processingTime: elapsed,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    const elapsed = Date.now() - startTime;
    
    console.error('='.repeat(60));
    console.error(`❌ キューイングエラー [${requestId}]`);
    console.error(`  - エラー内容: ${error.message}`);
    console.error(`  - 処理時間: ${elapsed}ms`);
    console.error('='.repeat(60) + '\n');
    
    // ★エラーでも200を返す（Zoomのリトライを防ぐ）
    return res.status(200).json({
      success: false,
      message: 'Webhook received but queuing failed',
      error: error.message,
      trackingId: trackingId,
      processingTime: elapsed
    });
  }
}