# 🚀 完全ガイド：n8nでnote.comを操作するRemote MCP環境構築

## 📋 はじめに

このガイドでは、**CLI不要でLLMから直接note.comの下書き投稿ができるRemote MCP環境**を構築する完全な手順を解説します。最終的にn8n Agent nodeから26ツールが利用可能になるHTTPS MCPサーバーを完成させます。

### 🎯 完成イメージ
```
n8n Agent node → Cloudflare tunnel → nginx → MCPサーバー → note.com API
```

### 必要なもの
- Xserver VPS（または任意のLinux VPS）
- Cloudflareアカウント
- note.comアカウント
- Dockerインストール済みの環境

---

## 🏗️ ステップ1：MCPサーバーの準備

### 1.1 プロジェクトのクローン
```bash
git clone [プロジェクトURL]
cd noteMCP
```

### 1.2 Dockerイメージのビルド
```bash
docker build -t note-mcp-server .
```

### 1.3 環境変数の設定
`.env`ファイルを作成：
```bash
NOTE_EMAIL=your_email@example.com
NOTE_PASSWORD=your_password
```

### 1.4 Docker ComposeでMCPサーバー起動
`docker-compose.xserver.yml` を使用：
```bash
docker-compose -f docker-compose.xserver.yml up -d
```

### 1.5 MCPサーバーの動作確認
```bash
curl http://localhost:3001/health
```
正常なレスポンスが返ってくれば成功です。

---

## 🌐 ステップ2：Cloudflare Tunnelの設定

### 2.1 Cloudflare Zero Trustの設定
1. [Cloudflareダッシュボード](https://dash.cloudflare.com)にログイン
2. **Zero Trust** → **Networks** → **Tunnels** と移動
3. **Create tunnel** をクリック
4. **Cloudflared** を選択し、トンネルを作成
5. 生成されたトークンをコピー

### 2.2 cloudflaredコンテナの実行
```bash
docker run -d --name cloudflared --network host --restart=always \
  cloudflare/cloudflared:latest tunnel --no-autoupdate run --token [YOUR_TOKEN]
```

### 2.3 Public Hostnameの設定
1. 作成したトンネルを選択
2. **Public Hostnames** タブを開く
3. **Add a public hostname** をクリック
4. 以下のように設定：
   - **Subdomain**: note-mcp
   - **Domain**: composition2940.com
   - **Service URL**: `http://127.0.0.1:8080`（※後でnginxを設定するため）

---

## 🔄 ステップ3：nginxリバースプロキスの導入

### 3.1 nginx設定ファイルの作成
`nginx-reverse-proxy.conf` を作成：

```nginx
events {
    worker_connections 1024;
}

http {
    server {
        listen 8080;
        server_name localhost;
        
        location / {
            proxy_pass http://127.0.0.1:3001;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            
            # HTTP/1.1を強制（重要！）
            proxy_http_version 1.1;
            proxy_set_header Connection "";
            
            # タイムアウト設定
            proxy_connect_timeout 30s;
            proxy_send_timeout 30s;
            proxy_read_timeout 30s;
        }
    }
}
```

### 3.2 nginxコンテナの起動
```bash
# 設定ファイルをVPSにアップロード
scp -P 2222 nginx-reverse-proxy.conf root@[VPS_IP]:/tmp/

# nginxコンテナをhostネットワークで実行
docker run -d --name nginx --network host \
  -v /tmp/nginx-reverse-proxy.conf:/etc/nginx/nginx.conf:ro \
  nginx:alpine
```

### 3.3 nginx→MCP接続の確認
```bash
curl -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

---

## 🔧 ステップ4：Cloudflare Tunnelの最終設定

### 4.1 設定の伝播確認
cloudflaredが新しい設定を受信したか確認：
```bash
docker logs cloudflared --tail 10 | grep "Updated to new configuration"
```

### 4.2 HTTPSエンドポイントのテスト
```bash
curl -X POST https://note-mcp.composition2940.com/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

26ツールのリストが返ってくれば成功です！

---

## 🎯 ステップ5：n8n Agent nodeとの連携

### 5.1 n8nでの設定
1. n8nワークフローで**AI Agent**ノードを追加
2. **Model Provider** で **Custom** を選択
3. **MCP Endpoint** に以下を設定：
   ```
   https://note-mcp.composition2940.com/mcp
   ```
4. **Connect** をクリック

### 5.2 ツールの確認
接続が成功すると、以下の26ツールが利用可能になります：

#### 🔍 検索・分析系
- `search-notes` - note.com記事検索
- `analyze-notes` - 記事分析・競合分析
- `search-users` - ユーザー検索
- `search-magazines` - マガジン検索
- `search-all` - note.com全体検索

#### 📝 コンテンツ作成系
- `post-draft-note` - 下書き投稿（Markdown→HTML変換）
- `edit-note` - 記事編集
- `upload-image` - 画像アップロード
- `upload-images-batch` - 複数画像一括アップロード

#### 👤 ユーザー情報系
- `get-user` - ユーザー詳細取得
- `get-user-notes` - ユーザー記事一覧
- `get-my-notes` - 自分の記事一覧
- `get-circle-info` - サークル情報

#### 💬 コミュニケーション系
- `get-comments` - コメント一覧取得
- `post-comment` - コメント投稿
- `like-note` - いいね
- `unlike-note` - いいね削除

#### 💰 メンバーシップ系
- `get-membership-summaries` - 加入メンバーシップ一覧
- `get-membership-plans` - 自分のメンバーシッププラン
- `get-membership-notes` - メンバーシップ記事一覧

#### 📊 分析・管理系
- `get-note` - 記事詳細取得
- `get-magazine` - マガジン詳細取得
- `list-categories` - カテゴリー一覧
- `list-hashtags` - ハッシュタグ一覧
- `get-stats` - PV統計情報
- `get-notice-counts` - 通知件数

---

## 🛠️ ステップ6：運用・監視設定

### 6.1 コンテナ状態の監視
```bash
# 全コンテナの状態確認
docker ps | grep -E "(note-mcp|nginx|cloudflared)"

# 個別のログ確認
docker logs note-mcp --tail 20 -f
docker logs nginx --tail 20 -f
docker logs cloudflared --tail 20 -f
```

### 6.2 ヘルスチェックの自動化
```bash
# ヘルスチェック用スクリプト
#!/bin/bash
# health-check.sh

MCP_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/health)
NGINX_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/health)
HTTPS_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" https://note-mcp.composition2940.com/health)

echo "MCP Server: $MCP_HEALTH"
echo "Nginx: $NGINX_HEALTH"
echo "HTTPS Endpoint: $HTTPS_HEALTH"

if [ "$MCP_HEALTH" != "200" ] || [ "$NGINX_HEALTH" != "200" ] || [ "$HTTPS_HEALTH" != "200" ]; then
    echo "❌ Health check failed!"
    # ここにアラート通知などを追加
else
    echo "✅ All systems healthy"
fi
```

### 6.3 自動再起動設定
```bash
# systemdサービスファイルの作成
sudo tee /etc/systemd/system/mcp-health-monitor.service > /dev/null <<EOF
[Unit]
Description=MCP Health Monitor
After=docker.service

[Service]
Type=oneshot
ExecStart=/path/to/health-check.sh

[Install]
WantedBy=multi-user.target
EOF

# タイマー設定（5分ごと）
sudo tee /etc/systemd/system/mcp-health-monitor.timer > /dev/null <<EOF
[Unit]
Description=Run MCP health monitor every 5 minutes

[Timer]
OnCalendar=*:0/5
Persistent=true

[Install]
WantedBy=timers.target
EOF

# 有効化
sudo systemctl enable mcp-health-monitor.timer
sudo systemctl start mcp-health-monitor.timer
```

---

## 🔍 トラブルシューティング

### よくある問題と解決策

#### 502 Bad Gatewayエラー
**原因**: Cloudflare tunnelの設定が古い
**解決策**:
```bash
# cloudflaredを再起動して設定を再取得
docker restart cloudflared
sleep 30
docker logs cloudflared --tail 5
```

#### ツールが表示されない
**原因**: CORS設定の問題
**解決策**: MCPサーバーのCORS設定を確認
```bash
# OPTIONSリクエストテスト
curl -X OPTIONS https://note-mcp.composition2940.com/mcp \
  -H "Origin: https://app.n8n.cloud" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type"
```

#### 接続タイムアウト
**原因**: コンテナ間通信の問題
**解決策**:
```bash
# ネットワーク接続確認
docker exec note-mcp curl http://localhost:3001/health
docker exec nginx curl http://127.0.0.1:3001/health
```

---

## 📈 パフォーマンス最適化

### nginxのキャッシュ設定
```nginx
http {
    # キャッシュ設定
    proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=mcp_cache:10m max_size=1g inactive=60m;

    server {
        listen 8080;
        
        location /mcp {
            proxy_cache mcp_cache;
            proxy_cache_valid 200 5m;
            proxy_cache_key "$request_uri$request_body";
            
            proxy_pass http://127.0.0.1:3001;
            # ... 他の設定
        }
    }
}
```

### コンテナリソース制限
```yaml
# docker-compose.ymlの追記
services:
  note-mcp-server:
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M
```

---

## 🚀 スケーリングと拡張

### 複数MCPサーバーの負荷分散
```nginx
http {
    upstream mcp_servers {
        server 127.0.0.1:3001;
        server 127.0.0.1:3002;
        server 127.0.0.1:3003;
    }

    server {
        listen 8080;
        
        location / {
            proxy_pass http://mcp_servers;
            # ... 他の設定
        }
    }
}
```

### 新機能の追加
1. 新しいツールをMCPサーバーに実装
2. Dockerイメージを再ビルド
3. コンテナを更新
```bash
docker-compose -f docker-compose.xserver.yml build
docker-compose -f docker-compose.xserver.yml up -d
```

---

## 🎉 まとめ

このガイドで構築した環境により、以下のことが可能になります：

✅ **LLMからの直接操作**: n8n Agent node経由でnote.comの全機能にアクセス  
✅ **完全自動化**: 下書き投稿、画像アップロード、分析など26ツール  
✅ **HTTPSセキュリティ**: Cloudflare tunnelによる安全な接続  
✅ **スケーラビリティ**: 複数サーバー対応、機能拡張可能  
✅ **運用準備完了**: 監視、ヘルスチェック、自動再起動  

### 最終的なエンドポイント
```
https://mcp-note.composition2940.com/mcp
```

このURLをn8n Agent nodeに設定するだけで、note.comの全機能がLLMから利用可能になります！

---

## 🔗 参考資料

- [MCPプロトコル仕様](https://modelcontextprotocol.io/)
- [n8n Agent nodeドキュメント](https://docs.n8n.io/integrations/agent/)
- [Cloudflare Tunnelガイド](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/)
- [nginxリバースプロキス設定](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)

---

*構築完了日: 2025年11月24日*  
*対応ツール数: 26/26*  
*ステータス: 🟢 本番運用準備完了*
