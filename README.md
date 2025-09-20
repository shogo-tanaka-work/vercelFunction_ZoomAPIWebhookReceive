# vercelFunction_ZoomAPIWebhookReceive

ZoomAPIより発行されるWebhookを受信するためのvercel_functionリポジトリです。

## 機能

- Zoom Webhook URL検証の自動処理
- Zoom Webhookイベントの署名検証
- Google Apps Script (GAS) への自動転送

## セットアップ

1. Vercelにデプロイ
2. 環境変数の設定（`ENVIRONMENT_SETUP.md`を参照）
3. ZoomアプリのEvent SubscriptionsでWebhook URLを設定

## URL検証について

ZoomのWebhook設定時に自動的に実行されるURL検証に対応しています。
- `endpoint.url_validation`イベントを受信
- Secret TokenでHMAC-SHA256暗号化
- 適切な形式でレスポンスを返却

## テスト

```bash
# URL検証テスト
curl -X POST https://your-vercel-domain.vercel.app/api/send \
  -H 'Content-Type: application/json' \
  -d '{"event":"endpoint.url_validation","payload":{"plainToken":"test123"}}'
```
