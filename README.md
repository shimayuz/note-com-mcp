# note.com MCP Server

note.comのAPIを利用して、Claude Desktop、Cursor、n8nなどのMCPクライアントから記事の検索・投稿・分析ができるMCPサーバーです。

## 📢 リポジトリ移行のお知らせ（2025年11月）

**リポジトリを移行しました。**

- ⚠️ **旧リポジトリ**: `shimayuz/note-mcp-server` （削除済み）
- ✅ **新リポジトリ**: `shimayuz/note-com-mcp` （現在のリポジトリ）

### 🔄 移行内容
- 📦 **同じ機能**: すべてのMCPツールと機能は変更なし
- 🚀 **改善されたセットアップ**: より簡単なインストール手順

**古いリポジトリは使用しないでください。必ず新しいリポジトリをご利用ください。**

## 🚀 クイックスタート

### 1. インストール

```bash
git clone https://github.com/shimayuz/note-com-mcp.git
cd note-com-mcp
npm install
npx playwright install  # ブラウザ自動ログイン用
npm run build
```

### 2. 認証設定

#### 方法A: 初回起動時に手動ログイン（推奨）

`.env`ファイルなしで起動すると、Playwrightがブラウザを開きます。

```bash
npm run start
```

1. Chromiumブラウザが自動で開く
2. note.comのログインページが表示される
3. **手動でメールアドレスとパスワードを入力してログイン**
4. ログイン完了を検知し、セッション情報を自動取得
5. ブラウザが自動で閉じる
6. MCPサーバーが起動完了

#### 方法B: .envファイルで認証情報を設定

```bash
cp .env.sample .env
```

`.env` を編集
```env
NOTE_EMAIL=your-email@example.com
NOTE_PASSWORD=your-password
# 以下はオプション（自動取得される）
NOTE_SESSION_V5=取得したセッションCookie
NOTE_XSRF_TOKEN=取得したXSRFトークン
NOTE_USER_ID=あなたのユーザーID
```

**注意**: `NOTE_EMAIL`と`NOTE_PASSWORD`を設定すると、自動ログインを試行します。

### 3. 起動

**ローカル利用（Claude Desktop/Cursor）:**
```bash
npm run start
```

**リモート利用（n8n/HTTP経由）:**
```bash
npm run start:http
# ポート3000が使用中の場合：
MCP_HTTP_PORT=3001 npm run start:http
```

## ✨ 主な機能

| カテゴリ   | 機能                                     | 認証 |
| ---------- | ---------------------------------------- | ---- |
| 🔍 検索     | 記事検索、ユーザー検索、ハッシュタグ検索 | 不要 |
| 📊 分析     | 記事分析、エンゲージメント分析           | 不要 |
| ✍️ 投稿     | 下書き作成、画像付き投稿                 | 必須 |
| 🖼️ 画像     | 画像アップロード、アイキャッチ設定       | 必須 |
| 💬 コメント | コメント投稿、スキ機能                   | 必須 |
| 📈 統計     | PV数、アクセス解析                       | 必須 |

## 📋 利用可能なツール

### 検索・分析（認証不要）
- `search-notes` - 記事検索（新着/人気/急上昇）
- `search-all` - note全体検索
- `analyze-notes` - 記事詳細分析
- `get-note` - 記事詳細取得
- `search-users` - ユーザー検索
- `get-user` - ユーザー情報取得
- `search-magazines` - マガジン検索

### 投稿・編集（認証必須）
- `post-draft-note` - 下書き作成
- `post-draft-note-with-images` - 画像付き下書き作成
- `upload-image` - 画像アップロード
- `upload-images-batch` - 複数画像アップロード
- `get-my-notes` - 自分の記事一覧

### インタラクション（認証必須）
- `post-comment` - コメント投稿
- `like-note` / `unlike-note` - スキ機能
- `get-stats` - PV統計情報

## 🔧 設定方法

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json` に以下を追加

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

### Cursor

`~/.cursor/mcp.json` に以下を追加

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

`~/.codeium/windsurf/mcp_config.json` に以下を追加

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

**重要**: `/path/to/note-com-mcp` は、実際のプロジェクトの絶対パスに置き換えてください。例：`/Users/username/note-com-mcp`

### n8n（HTTP経由）

1. HTTPサーバーを起動
```bash
npm run start:http
```

2. n8nで「MCP Client HTTP Streamable」ノードを設定
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

## 📝 Markdown変換ルール

投稿時のMarkdownは自動的にnote.com用HTMLに変換されます。

| Markdown         | note.com | HTML            |
| ---------------- | -------- | --------------- |
| `# H1` / `## H2` | 大見出し | `<h2>`          |
| `### H3`         | 小見出し | `<h3>`          |
| `#### H4-H6`     | 太字     | `<strong>`      |
| `![[image.png]]` | 画像     | `<figure><img>` |
| `- リスト`       | 箇条書き | `<ul><li>`      |

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

- **投稿機能**: 下書き作成のみ対応です。公開はnote.comから直接投稿してください
- **画像**: サポート形式はPNG、JPEG、GIFです（最大10MB）
- **検索結果**: 最大20件まで取得できます
- **認証**: Cookieの有効期限（約1〜2週間）切れで再設定が必要です

## 🛠️ 開発

```bash
# 開発モード（ファイル監視）
npm run dev:watch

# HTTPサーバー開発
npm run dev:http

# TypeScript直接実行
npm run dev:ts
```

## 📄 ライセンス

MIT License