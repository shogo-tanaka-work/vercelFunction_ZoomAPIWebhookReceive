import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';

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
async function handler(req) {
  console.log('\n' + '='.repeat(60));
  console.log('🔧 バックグラウンド処理開始:', new Date().toISOString());
  console.log('='.repeat(60));
  
  const body = await req.json();
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
    return new Response(
      JSON.stringify({ 
        success: true,
        trackingId: trackingId,
        duration: result.duration
      }), 
      { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
    
  } catch (error) {
    console.error('='.repeat(60));
    console.error(`❌ 処理失敗 [${requestId}]`);
    console.error(`  - エラー: ${error.message}`);
    console.error('='.repeat(60) + '\n');
    
    // ★エラーを返すとQStashが自動リトライ（最大3回）
    return new Response(
      JSON.stringify({ 
        error: error.message,
        trackingId: trackingId
      }), 
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

// ★QStashからの署名検証付きでエクスポート（セキュリティ対策）
export default verifySignatureAppRouter(handler);

export const config = {
  api: {
    bodyParser: false, // QStash検証のため必須
  },
};