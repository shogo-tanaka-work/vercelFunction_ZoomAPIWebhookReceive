# 環境変数設定手順

## Vercelでの環境変数設定

1. Vercelダッシュボードにログイン
2. プロジェクトを選択
3. Settings → Environment Variables に移動
4. 以下の環境変数を追加：

### 必須環境変数

#### ZOOM_WEBHOOK_SECRET_TOKEN
- **値**: ZoomアプリのSecret Token
- **取得場所**: Zoom Marketplace → 作成したアプリ → Features → Event Subscriptions → Secret Token
- **注意**: OAuthのClient SecretやJWTの秘密鍵ではありません

#### GAS_ENDPOINT_URL（既存）
- **値**: Google Apps ScriptのWebアプリURL
- **形式**: `https://script.google.com/macros/s/[SCRIPT_ID]/exec`

## 設定確認方法

環境変数が正しく設定されているか確認するには、以下のcurlコマンドを実行：

```bash
# URL検証テスト
curl -X POST https://your-vercel-domain.vercel.app/api/send \
  -H 'Content-Type: application/json' \
  -d '{"event":"endpoint.url_validation","payload":{"plainToken":"test123"}}'
```

成功時のレスポンス例：
```json
{
  "plainToken": "test123",
  "encryptedToken": "a1b2c3d4e5f6..."
}
```

## トラブルシューティング

### エラー: "Secret token not configured"
- ZOOM_WEBHOOK_SECRET_TOKENが設定されていません
- Vercelの環境変数設定を確認してください

### エラー: "Signature verification failed"
- Secret Tokenが間違っている可能性があります
- Zoomアプリの設定を再確認してください
