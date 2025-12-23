# Remote MCP デプロイガイド

## 🎯 目的

n8n（セルフホスト）から CLI なしで MCP サーバーにアクセスできるようにする

## 📋 デプロイオプション

### オプション1: Railway（推奨 - 最も簡単）

```bash
# 1. Railway CLI をインストール
npm install -g @railway/cli

# 2. ログイン
railway login

# 3. プロジェクトをデプロイ
railway up

# 4. 環境変数を設定
railway variables set NOTE_EMAIL=your_email@example.com
railway variables set NOTE_PASSWORD=your_password
railway variables set DEBUG=false

# 5. 公開URLを取得
railway open
```

### オプション2: Vercel

```bash
# 1. Vercel CLI をインストール
npm install -g vercel

# 2. デプロイ
vercel

# 3. 環境変数を設定
vercel env add NOTE_EMAIL
vercel env add NOTE_PASSWORD
vercel env add DEBUG

# 4. 再デプロイ
vercel --prod
```

### オプション3: Docker + Cloud Server

```bash
# 1. ビルド
docker build -t note-mcp-server .

# 2. 環境変数ファイルを作成
echo "NOTE_EMAIL=your_email@example.com" > .env
echo "NOTE_PASSWORD=your_password" >> .env
echo "DEBUG=false" >> .env

# 3. 実行
docker run -d \
  --name note-mcp \
  -p 3001:3001 \
  --env-file .env \
  --restart unless-stopped \
  note-mcp-server
```

### オプション4: ngrok（開発用）

```bash
# 1. ngrok をインストール
brew install ngrok  # または https://ngrok.com/download

# 2. ローカルサーバーを起動
npm run dev:http

# 3. 別のターミナルで ngrok を実行
ngrok http 3001

# 4. 表示された https://xxxxx.ngrok.io を使用
```

## 🔧 n8n での設定

デプロイ後、n8n の mcp-remote URL を更新：

```bash
# Railway の場合
mcp-remote https://your-app.railway.app/mcp

# Vercel の場合
mcp-remote https://your-app.vercel.app/mcp

# ngrok の場合
mcp-remote https://xxxxx.ngrok.app/mcp

# 自前サーバーの場合
mcp-remote https://your-domain.com:3001/mcp
```

## 📝 環境変数の設定

必須の環境変数：
- `NOTE_EMAIL`: note.com のメールアドレス
- `NOTE_PASSWORD`: note.com のパスワード
- `DEBUG`: デバッグモード（true/false）

## 🚀 Railway デプロイ手順（詳細）

### 1. 準備
```bash
# Railway にプッシュするために .gitignore を確認
echo ".env" >> .gitignore
echo "build/" >> .gitignore
echo "node_modules/" >> .gitignore
```

### 2. railway.json を作成
```json
{
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm run start:http",
    "healthcheckPath": "/health"
  }
}
```

### 3. デプロイ
```bash
railway up
```

### 4. 公開URLを確認
```bash
railway open
# 例: https://note-mcp-production.up.railway.app
```

## 🔍 動作確認

```bash
# ヘルスチェック
curl https://your-app.railway.app/health

# ツールリスト取得
curl -X POST https://your-app.railway.app/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## 🎯 n8n AI Agent ノードの設定

1. **Tool URL**: `https://your-app.railway.app/mcp`
2. **Method**: POST
3. **Headers**: 
   ```json
   {
     "Content-Type": "application/json"
   }
   ```
4. **Body Format**: JSON-RPC 2.0

## 🐛 トラブルシューティング

### 401/403 エラー
- 環境変数の認証情報を確認
- note.com にログインできるか確認

### 接続タイムアウト
- サーバーが起動しているか確認
- ヘルスチェックエンドポイントにアクセス

### n8n の nodeName エラー
- n8n v1.120 の既知のバグ
- HTTP Request ノードで直接 MCP を呼び出すことを推奨
