# note.com MCP Server

note.comのAPIを利用して、Claude Desktop、Claude Code、Cursor、n8nなどのMCPクライアントから記事の検索・投稿・分析ができるMCPサーバーです。

stdio（ローカル）とHTTP（リモート）の両方のトランスポートに対応しています。

---

## 🚀 クイックスタート

### 1. インストール

```bash
git clone https://github.com/shimayuz/note-com-mcp.git
cd note-com-mcp
npm install
npx playwright install chromium  # ブラウザ自動ログイン用
npm run build
```

### 2. 認証設定

```bash
cp .env.sample .env
```

`.env` を編集：

```env
NOTE_EMAIL=your-email@example.com
NOTE_PASSWORD=your-password
NOTE_USER_ID=your_note_user_id
```

起動時にPlaywrightが自動でheadlessログインを行い、セッションCookieを取得・更新します。手動でCookieを設定する必要はありません。

**セキュリティ**: `.env`ファイルは`.gitignore`に含まれているため、リポジトリにコミットされません。

### 3. 起動

**stdioモード（Claude Desktop / Claude Code / Cursor）:**

```bash
npm run start
```

**HTTPモード（n8n / リモート接続）:**

```bash
npm run start:http
# デフォルトポートは3000。変更する場合：
MCP_HTTP_PORT=3001 node build/note-mcp-server.js
```

## 🔌 トランスポート

### stdioモード（デフォルト）

ローカルのMCPクライアントから直接起動される標準的な接続方式です。

```bash
node build/note-mcp-server.js
```

### HTTPモード

リモートクライアントやn8nから接続するためのHTTPベースの接続方式です。`MCP_HTTP_PORT`環境変数または`--http`フラグで有効化されます。

```bash
# 環境変数で指定
MCP_HTTP_PORT=3000 node build/note-mcp-server.js

# CLIフラグで指定（ポートはMCP_HTTP_PORTまたはデフォルト3000）
node build/note-mcp-server.js --http
```

| エンドポイント | メソッド | 説明 |
|---------------|---------|------|
| `/mcp` | POST | MCP JSON-RPCリクエスト |
| `/mcp` | GET | SSEストリーム |
| `/mcp` | DELETE | セッション終了 |
| `/health` | GET | ヘルスチェック |

デフォルトのバインドアドレスは`127.0.0.1`です。`MCP_HTTP_HOST`環境変数で変更できます。

## ✨ 主な機能

| カテゴリ | 機能 | 認証 |
|---------|------|------|
| 🔍 検索 | 記事検索、ユーザー検索、ハッシュタグ検索 | 不要 |
| 📊 分析 | 記事分析、エンゲージメント分析 | 不要 |
| ✍️ 投稿 | 下書き作成、画像付き投稿 | 必須 |
| 🖼️ 画像 | 画像アップロード、アイキャッチ設定 | 必須 |
| 💬 コメント | コメント投稿、スキ機能 | 必須 |
| 📈 統計 | PV数、アクセス解析 | 必須 |

## 📋 利用可能なツール

### 検索・分析（認証不要）

- `search-notes` - 記事検索（新着/人気/急上昇）
- `search-all` - note全体検索
- `analyze-notes` - 記事詳細分析
- `get-note` - 記事詳細取得
- `search-users` - ユーザー検索
- `get-user` - ユーザー情報取得
- `get-user-notes` - ユーザーの記事一覧
- `search-magazines` - マガジン検索
- `get-magazine` - マガジン詳細
- `get-category-notes` - カテゴリー別記事一覧
- `list-categories` - カテゴリー一覧
- `list-hashtags` - ハッシュタグ一覧
- `get-hashtag` - ハッシュタグ詳細
- `get-comments` - コメント一覧
- `get-likes` - スキ一覧
- `list-contests` - コンテスト一覧

### 投稿・編集（認証必須）

- `post-draft-note` - 下書き作成（Markdown自動変換）
- `get-my-notes` - 自分の記事一覧（下書き含む）
- `open-note-editor` - 記事の編集ページを開く

### インタラクション（認証必須）

- `post-comment` - コメント投稿
- `like-note` / `unlike-note` - スキ機能
- `add-magazine-note` / `remove-magazine-note` - マガジン管理
- `get-stats` - PV統計情報
- `get-notice-counts` - 通知件数
- `get-search-history` - 検索履歴

### メンバーシップ（認証必須）

- `get-membership-summaries` - 加入済みメンバーシップ一覧
- `get-membership-plans` - メンバーシッププラン一覧
- `get-membership-notes` - メンバーシップの記事一覧
- `get-circle-info` - サークル情報

## 🔧 設定方法

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "note-api": {
      "command": "node",
      "args": ["/path/to/note-com-mcp/build/note-mcp-server.js"],
      "env": {
        "NOTE_EMAIL": "your_email@example.com",
        "NOTE_PASSWORD": "your_password",
        "NOTE_USER_ID": "your_note_user_id"
      }
    }
  }
}
```

### Claude Code

`~/.claude/settings.json` の `mcpServers` に追加：

```json
{
  "mcpServers": {
    "note-api": {
      "command": "node",
      "args": ["/path/to/note-com-mcp/build/note-mcp-server.js"],
      "cwd": "/path/to/note-com-mcp",
      "env": {
        "NOTE_EMAIL": "your_email@example.com",
        "NOTE_PASSWORD": "your_password",
        "NOTE_USER_ID": "your_note_user_id"
      }
    }
  }
}
```

### Cursor

`~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "note-api": {
      "command": "node",
      "args": ["/path/to/note-com-mcp/build/note-mcp-server.js"],
      "env": {
        "NOTE_EMAIL": "your_email@example.com",
        "NOTE_PASSWORD": "your_password",
        "NOTE_USER_ID": "your_note_user_id"
      }
    }
  }
}
```

### Windsurf

`~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "note-api": {
      "command": "node",
      "args": ["/path/to/note-com-mcp/build/note-mcp-server.js"],
      "env": {
        "NOTE_EMAIL": "your_email@example.com",
        "NOTE_PASSWORD": "your_password",
        "NOTE_USER_ID": "your_note_user_id"
      }
    }
  }
}
```

> `/path/to/note-com-mcp` は実際のプロジェクトの絶対パスに置き換えてください。

### n8n（HTTP経由）

1. HTTPサーバーを起動：

```bash
npm run start:http
```

2. n8nで「MCP Client HTTP Streamable」ノードを設定：

```
HTTP Stream URL: http://127.0.0.1:3000/mcp
HTTP Connection Timeout: 60000
```

## 🌐 リモートアクセス（Cloudflare Tunnel）

VPSでn8nを使用する場合、Cloudflare Tunnelで安全に接続できます：

```bash
# 1. Cloudflare Tunnelを設定
cloudflared tunnel run note-mcp

# 2. n8nでHTTPS URLを設定
# HTTPS Stream URL: https://your-domain.com/mcp
```

## 🔐 認証フロー

起動時に以下の順序で認証情報を取得します：

1. `NOTE_EMAIL` / `NOTE_PASSWORD` が設定されている場合、Playwrightでheadlessログインを実行し、最新のセッションCookieを自動取得
2. Playwright失敗時は `.env` の既存Cookie情報にフォールバック
3. どちらもない場合はPlaywrightがブラウザを開き、手動ログインを求める

セッションCookieは自動で`.env`に永続化されるため、次回起動時にも利用可能です。

## 📝 Markdown変換ルール

投稿時のMarkdownは自動的にnote.com用HTMLに変換されます。

| Markdown | note.com | HTML |
|----------|----------|------|
| `# H1` / `## H2` | 大見出し | `<h2>` |
| `### H3` | 小見出し | `<h3>` |
| `#### H4-H6` | 太字 | `<strong>` |
| `![[image.png]]` | 画像 | `<figure><img>` |
| `- リスト` | 箇条書き | `<ul><li>` |

## 💡 使い方の例

### 記事検索（認証不要）

```
noteで「プログラミング」に関する人気記事を検索して
```

### 画像付き投稿（認証必須）

```
タイトル「技術メモ」、本文「## 概要\n\n![[screenshot.png]]」で下書きを作成して
```

### 記事分析（認証不要）

```
ユーザー「username」の記事を分析して、人気の要因を教えて
```

## ⚠️ 注意点

- **投稿機能**: 下書き作成のみ対応です。公開はnote.comから直接行ってください
- **画像**: サポート形式はPNG、JPEG、GIFです（最大10MB）
- **検索結果**: 最大20件まで取得できます
- **認証**: セッションCookieは約1~2週間で期限切れになりますが、メール/パスワード設定済みなら自動更新されます

## 🛠️ 開発

```bash
# ビルド
npm run build

# 開発モード（ファイル監視）
npm run dev:watch

# HTTPサーバー開発
npm run dev:http
```

## 📄 ライセンス

MIT License
