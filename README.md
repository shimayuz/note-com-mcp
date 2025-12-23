# note.com MCP Server

このMCPサーバーは、note.comのAPIを利用して記事の閲覧や投稿、ユーザー情報の取得などをClaude Desktop、n8n、その他のMCPクライアントから実行できるようにするものです。

## 📢 リポジトリ移行のお知らせ（2025年11月）

**リポジトリを移行しました。**

- ⚠️ **旧リポジトリ**: `shimayuz/note-mcp-server` （削除済み）
- ✅ **新リポジトリ**: `shimayuz/note-com-mcp` （現在のリポジトリ）

### 🔄 移行内容
- 📦 **同じ機能**: すべてのMCPツールと機能は変更なし
- 🚀 **改善されたセットアップ**: より簡単なインストール手順

### 📦 新しいセットアップ
```bash
# 新しいリポジトリをクローン
git clone https://github.com/shimayuz/note-com-mcp.git
cd note-com-mcp

# 既存のセットアップ手順に従ってインストール
npm install
npm run build
npm run start:http
```

**古いリポジトリは使用しないでください。必ず新しいリポジトリをご利用ください。**

## 🚀 新機能: HTTP/SSE トランスポート対応（2025年11月）

**Streamable HTTPトランスポートに対応しました！**

- 🌐 **リモートアクセス**: Cloudflare Tunnelを使用してVPS上のn8nから安全にアクセス可能
- 🔒 **セキュリティ**: 認証情報はローカルPCに保持したまま、リモートから利用可能
- 🔄 **自動化**: n8nなどのワークフロー自動化ツールとシームレスに統合
- 💰 **無料**: Cloudflare Tunnelは無料で利用可能
- 🔌 **Remote MCP**: Claude Desktop、Cursor、その他のMCPクライアントからHTTP経由で接続可能

### クイックスタート（Remote MCP）

```bash
# 1. HTTPサーバー起動
npm run start:http
# または、カスタムポートで起動
MCP_HTTP_PORT=3001 npm run start:http

# 2. ヘルスチェック
curl http://127.0.0.1:3001/health

# 3. Claude Desktopで接続
# ~/Library/Application Support/Claude/claude_desktop_config.json に以下を追加:
{
  "mcpServers": {
    "note-api": {
      "url": "http://127.0.0.1:3001/sse",
      "transport": "sse"
    }
  }
}

# 4. Cursorで接続
# Cursor設定に以下を追加:
{
  "mcpServers": {
    "note-api": {
      "url": "http://127.0.0.1:3001/mcp",
      "transport": "http"
    }
  }
}
```

### クイックスタート（n8n統合）

```bash
# 1. HTTPサーバー起動
npm run start:http

# 2. Cloudflare Tunnel起動
cloudflared tunnel run note-mcp

# 3. n8nで接続
# HTTP Stream URL: 表示されたCloudflare URL + /mcp
```

詳細は [Cloudflare Tunnel セットアップガイド](./docs/CLOUDFLARE_TUNNEL_SETUP.md) を参照してください。

#### Cloudflare Tunnel + HTTPストリーム運用のチェックリスト

1. **ビルド & HTTPサーバー起動**
   ```bash
   npm run build
   MCP_HTTP_PORT=3001 npm run start:http
   ```
2. **トンネル設定（例: `note-mcp`）**
   - `~/.cloudflared/config.yml` に以下のように記載
     ```yaml
     tunnel: <your-tunnel-uuid>
     credentials-file: ~/.cloudflared/<your-tunnel-uuid>.json
     ingress:
       - hostname: note-mcp.example.com
         service: http://localhost:3001
       - service: http_status:404
     ```
   - `cloudflared tunnel run note-mcp` を実行。
3. **ヘルスチェック**
   ```bash
   curl https://note-mcp.example.com/health
   ```
   200 応答ならトンネル経由で到達しています。
4. **MCP接続テスト**
   ```bash
   curl -X POST https://note-mcp.example.com/mcp \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
   ```
   `serverInfo.version` が返ればHTTP streamable経由で利用可能です。

> **NOTE:** `post-draft-note` など本文を扱うツールでは、Markdown入力をサーバー側で自動的にHTML（UUID属性付き）へ変換します。クライアント側で変換処理を行う必要はありません。

#### n8n / Cursor / Claude からの接続設定例

すべてのクライアントで `mcp-remote` を使って HTTP エンドポイントへ接続します。

- **n8n (Execute Command ノード)**
  ```
  Command: npx
  Arguments:
    mcp-remote
    https://note-mcp.example.com/mcp
  ```
- **Cursor (.cursor/mcp.json)**
  ```json
  {
    "mcpServers": {
      "noteMCP-remote": {
        "command": "npx",
        "args": [
          "mcp-remote",
          "https://note-mcp.example.com/mcp"
        ]
      }
    }
  }
  ```
- **Claude Desktop / Windsurf** でも同様に `npx mcp-remote <URL>` 形式を指定します。

必要に応じて `Authorization` 等のカスタムヘッダーを `--header` オプションで追加してください。

## 📚 目次

- [リポジトリ移行のお知らせ](#-リポジトリ移行のお知らせ2025年11月)
- [新機能: HTTP/SSE トランスポート対応](#-新機能-httpsse-トランスポート対応2025年11月)
- [機能](#機能)
- [セットアップ](#セットアップ)
  - [必要なもの](#必要なもの)
  - [基本的なセットアップ手順](#基本的なセットアップ手順)
  - [ローカル利用（Claude Desktop等）](#ローカル利用claude-desktop等)
  - [リモート利用（n8n等）](#リモート利用n8n等)
  - [自動起動設定（macOS）](#-自動起動設定macos)
- [使い方](#使い方)
- [利用可能なツール](#利用可能なツール)
- [トラブルシューティング](#トラブルシューティング)

## ✨ リファクタリング完了（2025年5月30日）

**2900行のモノリシックファイルを16のモジュールに分割**し、保守性と性能を大幅に改善しました。

- 🚀 **93%サイズ削減**: 106KB → 7.5KB
- 📁 **モジュラー設計**: 機能別に整理された明確な構造 
- ⚡ **高速化**: モジュール化による起動・実行速度向上
- 🛠️ **開発効率**: 保守・拡張・テストが容易

## 機能

このMCPサーバーでは以下の機能が利用できます。

- 記事の検索と閲覧（新着順・人気順・急上昇でのソートに対応）
- ユーザーやハッシュタグを含めたnote全体検索
- ユーザーの検索とプロフィール閲覧
- 記事の詳細分析（エンゲージメント分析、コンテンツ分析、価格分析など）
- 自分の記事一覧（下書き含む）の取得
- 記事の投稿と編集（下書き）
- **🆕 画像付き下書き作成（Markdown→HTML自動変換、アイキャッチ対応）**
- **🆕 画像のアップロード（記事に使用可能な画像URLを取得）**
- コメントの閲覧と投稿
- スキの管理（取得・追加・削除）
- マガジンの検索と閲覧
- カテゴリー記事の閲覧
- PV統計情報の取得
- メンバーシップ情報の取得と閲覧
- コンテンツアイデアの生成と競合分析

## 認証について

このサーバーでは、ほとんどの読み取り機能（記事検索、ユーザー情報など）は**認証なしで利用できます**。一方、以下の機能を使用するには**note.comの認証情報**が必要です：

- 記事投稿（下書き）
- **画像アップロード**
- コメント投稿
- スキをつける/削除する
- PV統計情報の取得
- メンバーシップ情報の取得

認証情報は、プロジェクトルートに作成する `.env` ファイルに設定します。`.env.example` ファイルをテンプレートとして使用し、ご自身の情報を入力してください。この `.env` ファイルは `.gitignore` によりリポジトリには含まれないため、安全に認証情報を管理できます。

## セットアップ

### 必要なもの

- Node.js (v18以上)
- npm または yarn
- Claude Desktop / Cursor / Windsurf
- note.comのアカウント（投稿機能を使う場合）

### 基本的なセットアップ手順

このリポジトリをクローンした人が、自分のローカル環境でMCPサーバーを使用するためのセットアップ手順です。

#### 1. リポジトリのクローンと準備

```bash
# リポジトリをクローン
git clone https://github.com/shimayuz/note-com-mcp.git
cd note-com-mcp

# 依存関係のインストール
npm install

# ビルド
npm run build
```

#### 2. 環境設定

プロジェクトルートに `.env` ファイルを作成し、note.comの認証情報を設定：

```bash
cp .env.example .env
```

`.env` ファイルを編集して、あなた自身のnote.com認証情報を設定：
```env
NOTE_EMAIL=your_email@example.com
NOTE_PASSWORD=your_password
NOTE_USER_ID=your_note_user_id
```

#### 3. MCPクライアントの設定

以下のいずれかの方法で、あなたのIDEやツールにMCPサーバーを設定してください。

##### Cursorの場合

CursorのMCP設定ファイル（`~/.cursor/mcp.json`）に以下を追加：

```json
{
  "mcpServers": {
    "note-api": {
      "command": "node",
      "args": [
        "/path/to/your/note-com-mcp/build/note-mcp-server-refactored.js"
      ],
      "env": {
        "NOTE_EMAIL": "your_email@example.com",
        "NOTE_PASSWORD": "your_password",
        "NOTE_USER_ID": "your_note_user_id"
      }
    }
  }
}
```

**注意**: `/path/to/your/note-com-mcp` は、あなたがクローンした実際のパスに置き換えてください。

##### Claude Desktopの場合

Claude Desktopの設定ファイル（`~/Library/Application Support/Claude/claude_desktop_config.json`）に以下を追加：

```json
{
  "mcpServers": {
    "note-api": {
      "command": "node",
      "args": [
        "/path/to/your/note-com-mcp/build/note-mcp-server-refactored.js"
      ],
      "env": {
        "NOTE_EMAIL": "your_email@example.com",
        "NOTE_PASSWORD": "your_password",
        "NOTE_USER_ID": "your_note_user_id"
      }
    }
  }
}
```

##### Windsurfの場合

WindsurfのMCP設定ファイル（`~/.codeium/windsurf/mcp_config.json`）に以下を追加：

```json
{
  "mcpServers": {
    "note-api": {
      "command": "node",
      "args": [
        "/path/to/your/note-com-mcp/build/note-mcp-server-refactored.js"
      ],
      "env": {
        "NOTE_EMAIL": "your_email@example.com",
        "NOTE_PASSWORD": "your_password",
        "NOTE_USER_ID": "your_note_user_id"
      }
    }
  }
}
```

#### 4. 起動とテスト

```bash
# サーバーを起動してテスト
npm run start
```

サーバーが正常に起動したら、あなたのIDEでnote.comの記事検索などが利用可能になります。

#### トラブルシューティング

- **パスが見つからない場合**: MCP設定ファイルのパス（`/path/to/your/note-com-mcp`）を、あなたの実際のクローン先ディレクトリに置き換えてください
- **認証エラーの場合**: `.env`ファイルの認証情報が正しいか確認してください
- **ビルドエラーの場合**: `npm install` と `npm run build` を再度実行してください

### ローカル利用（Claude Desktop等）

1. このリポジトリをクローンします:
   ```bash
   git clone https://github.com/note-mcp-developer/note-mcp-server.git <お好きなディレクトリ名>
   cd <お好きなディレクトリ名>
   ```

2. 依存パッケージをインストールします:
   ```bash
   npm install
   ```

3. 環境設定ファイルを作成します:
   プロジェクトルートにある `.env.example` ファイルをコピーして `.env` という名前のファイルを作成します。
   ```bash
   cp .env.example .env
   ```
   作成した `.env` ファイルを開き、あなたのnote.comの認証情報を設定してください。
   詳細は「認証情報の設定方法」セクションおよび `.env.example` ファイル内のコメントを参照してください。

   **重要**: `.env` ファイルは `.gitignore` によってGitの追跡対象から除外されています。そのため、あなたの個人的な認証情報が誤ってリポジトリにコミットされることはありません。ローカル環境で安全に管理してください。

4. サーバーをビルドして起動します:
   ```bash
   npm run build && npm run start
   ```
   このコマンドでTypeScriptコードをビルドし、サーバーを起動します。

### アーキテクチャについて

このMCPサーバーは、**モジュラー設計**により高い保守性を実現しています：

#### 📁 ディレクトリ構造
```
src/
├── config/          # 環境設定とAPI設定
├── types/           # TypeScript型定義
├── utils/           # 共通ユーティリティ
├── tools/           # 機能別MCPツール
├── prompts/         # プロンプトテンプレート
└── note-mcp-server-refactored.ts  # メインサーバー
```

#### 🚀 利用可能なスクリプト
- `npm run start`: 本番用サーバー起動（stdio）
- `npm run start:refactored`: リファクタリング版サーバー起動（stdio）
- `npm run start:http`: HTTPトランスポート版サーバー起動
- `npm run dev:refactored`: 開発用（ビルド＋起動、stdio）
- `npm run dev:http`: 開発用（ビルド＋起動、HTTP）
- `npm run dev:watch`: ファイル監視モード
- `npm run dev:ts`: TypeScript直接実行（開発用、stdio）
- `npm run dev:http:ts`: TypeScript直接実行（開発用、HTTP）

#### ⚡ パフォーマンス改善
- **ファイルサイズ**: 106KB → 7.5KB（93%削減）
- **起動速度**: モジュラー読み込みで高速化
- **保守性**: 機能別分離で開発効率向上

### 認証情報の設定方法

投稿やスキ、メンバーシップ情報取得などの機能を使うには、プロジェクトルートの `.env` ファイルに認証情報を設定します。`.env.example` を参考に、以下のいずれかの方法で設定してください。

#### 方法１：メールアドレスとパスワードによる認証（推奨）

`.env`ファイルにあなたのnote.comアカウントのメールアドレスとパスワード、およびユーザーIDを設定します：

```env
NOTE_EMAIL=your_email@example.com
NOTE_PASSWORD=your_password
NOTE_USER_ID=your_note_user_id
```

この方法のメリットは、Cookieのように期限切れの心配が少ないことです。サーバー起動時に自動的に認証されます。

#### 方法２：Cookieベースの認証（代替方法、非推奨
ブラウザの開発者ツールなどを使用して、note.comにログインした際のCookie情報を取得し、`.env`ファイルに設定します。

```env
NOTE_SESSION_V5=your_session_v5_cookie_value
NOTE_XSRF_TOKEN=your_xsrf_token_cookie_value
NOTE_USER_ID=your_note_user_id
```

**注意**: Cookie認証は有効期限があるため、定期的な更新が必要になる場合があります。

### Claude Desktopとの連携

1. Claude Desktopをインストールして起動

2. Claude Desktopの設定ファイルを開く:
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`

3. 設定ファイルに以下の内容を追加します。以下のいずれかの方法で設定してください。

   #### 方法１：設定ファイルに直接認証情報を記述（推奨）

   ```json
   {
     "mcpServers": {
       "note-api": {
         "command": "node",
         "args": [
           "/path/to/noteMCP/build/note-mcp-server-refactored.js"
         ],
         "env": {
           "NOTE_EMAIL": "note.comのメールアドレス",
           "NOTE_PASSWORD": "note.comのパスワード",
           "NOTE_USER_ID": "あなたのuser ID"
         }
       }
     }
   }
   ```

   Cookie認証を利用する場合は以下のように設定します:

   ```json
   {
     "mcpServers": {
       "note-api": {
         "command": "node",
         "args": [
           "/path/to/noteMCP/build/note-mcp-server-refactored.js"
         ],
         "env": {
           "NOTE_SESSION_V5": "あなたのセッションv5トークン",
           "NOTE_XSRF_TOKEN": "あなたのxsrfトークン",
           "NOTE_USER_ID": "あなたのuser ID"
         }
       }
     }
   }
   ```

   **注意**: `/path/to/noteMCP` は、あなたがこのプロジェクトをクローンした実際の絶対パスに置き換えてください。

   #### 方法２：.envファイルを使用（上級者向け）

   この方法では、先に作成した`.env`ファイルを使用します。設定ファイルにはプロジェクトの場所のみを指定します。

   ```json
   {
     "mcpServers": {
       "noteMCP": {
         "command": "npm",
         "args": ["run", "start"],
         "cwd": "/path/to/your/note-mcp-server", // あなたがクローンしたプロジェクトのルートパス
         "mcp_version": "0.0.1"
       }
     }
   }
   ```

   **注意**: 
   - この方法では、サーバーがプロジェクトルートの`.env`ファイルから環境変数を自動的に読み込みます。
   - この方法は、ターミナル操作に慣れている方向けです。

4. Claude Desktopを再起動

### Cursorでの連携

1. Cursorをインストールして起動

2. CursorのMCP設定ファイルを開く
   - macOS: `~/.cursor/mcp.json`
   - Windows: `%APPDATA%\.cursor\mcp.json`
もしくはCursor settingsを開き、MCP設定画面を開いてから、Add new global MCP serverを押します。

3. 設定ファイルに以下の内容を追加します

   ```json
   {
     "mcpServers": {
       "note-api": {
         "command": "node",
         "args": [
           "/path/to/noteMCP/build/note-mcp-server-refactored.js"
         ],
         "env": {
           "NOTE_EMAIL": "note.comのメールアドレス",
           "NOTE_PASSWORD": "note.comのパスワード",
           "NOTE_USER_ID": "あなたのuser ID"
         }
       }
     }
   }
   ```

   **注意**: `/path/to/noteMCP` は、あなたがこのプロジェクトをクローンした実際の絶対パスに置き換えてください。

4. Cursorを再起動

### Windsurfでの連携

1. Windsurfをインストールして起動

2. WindsurfのMCP設定ファイルを開く
   - macOS: `~/.codeium/windsurf/mcp_config.json`
   - Windows: `%APPDATA%\.codeium\windsurf\mcp_config.json`
もしくはWindsurf settingsを開き、Manage Pluginsを開いてから、View Raw Configを押します。

3. 設定ファイルに以下の内容を追加します

   ```json
   {
     "mcpServers": {
       "note-api": {
         "command": "node",
         "args": [
           "/path/to/noteMCP/build/note-mcp-server-refactored.js"
         ],
         "env": {
           "NOTE_EMAIL": "note.comのメールアドレス",
           "NOTE_PASSWORD": "note.comのパスワード",
           "NOTE_USER_ID": "あなたのuser ID"
         }
       }
     }
   }
   ```

   **注意**: `/path/to/noteMCP` は、あなたがこのプロジェクトをクローンした実際の絶対パスに置き換えてください。

4. Windsurfを再起動

### リモートMCP接続（HTTP/SSE トランスポート）

Streamable HTTPトランスポートを使用することで、Cursor、ChatGPT、OpenAI Responses APIなどからリモートMCPサーバーとして接続できます。

**推奨構成: Cloudflare Tunnel を使用したセキュアな接続**

VPS上でn8nをセルフホスティングしている場合、Cloudflare Tunnelを使用することで、認証情報をローカルPCに保持したまま、安全にリモートアクセスできます。

詳細な手順は [Cloudflare Tunnel セットアップガイド](./docs/CLOUDFLARE_TUNNEL_SETUP.md) を参照してください。

#### HTTPサーバーの起動

```bash
# ビルドして起動
npm run build && npm run start:http

# または開発モードで起動
npm run dev:http
```

デフォルトでは `http://127.0.0.1:3000` で起動します。ポートやホストを変更する場合は、`.env`ファイルに以下を追加してください：

```env
MCP_HTTP_PORT=3000
MCP_HTTP_HOST=127.0.0.1
```

#### 利用可能なエンドポイント

- **ヘルスチェック**: `http://127.0.0.1:3000/health`
- **MCPエンドポイント**: `http://127.0.0.1:3000/mcp`
- **SSEエンドポイント**: `http://127.0.0.1:3000/sse`

#### n8nでの接続設定

n8nで「MCP Client HTTP Streamable」ノードを使用して接続します：

```bash
# n8n接続用URLを取得
./scripts/manage-services.sh test
```

**n8n設定:**
```
HTTP Stream URL: https://note-mcp.your-domain.com/mcp
HTTP Connection Timeout: 60000
Messages Post Endpoint: (空欄)
Additional Headers: (空欄)
```

**対応機能:**
- ✅ `tools/list` - 23個のツール一覧取得
- ✅ `tools/call` - search-notes, get-noteツール実行
- ✅ JSON-RPC POSTリクエスト対応
- ✅ note.com認証情報の連携

**利用可能なツール（HTTP対応）:**
- `search-notes`: note.com記事検索
- `get-note`: 記事詳細取得
- 他21個のツール（一覧表示のみ、stdio推奨）

#### Cursorでのリモート接続設定

Cursorの設定ファイル（`~/.cursor/mcp.json`）に以下を追加：

```json
{
  "mcpServers": {
    "note-api-remote": {
      "url": "http://127.0.0.1:3000/mcp",
      "transport": "sse"
    }
  }
}
```

#### ChatGPT / OpenAI Responses APIでの接続

OpenAI APIを使用する場合、以下のようにMCPサーバーのURLを指定できます：

```python
from openai import OpenAI

client = OpenAI()
response = client.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "noteで人気の記事を検索して"}],
    mcp_servers=[{
        "url": "http://127.0.0.1:3000/mcp",
        "transport": "sse"
    }]
)
```

#### セキュリティに関する注意

- デフォルトでは `127.0.0.1`（localhost）でのみアクセス可能です
- 外部からのアクセスを許可する場合は、適切なファイアウォール設定と認証機構を実装してください
- 本番環境では、HTTPSを使用することを強く推奨します

## 🚀 自動起動設定（macOS）

macOSを使用している場合、`note-mcp-server`とCloudflare TunnelをPC起動時に自動で起動するように設定できます。

### 自動起動セットアップ

```bash
# 1. サービス管理スクリプトを実行可能に設定
chmod +x scripts/manage-services.sh

# 2. 自動起動設定（macOS LaunchAgent）
./scripts/manage-services.sh setup

# 3. サービスを起動
./scripts/manage-services.sh start

# 4. 状態を確認
./scripts/manage-services.sh status
```

### サービス管理コマンド

```bash
# 状態確認
./scripts/manage-services.sh status

# サービス起動
./scripts/manage-services.sh start

# サービス停止
./scripts/manage-services.sh stop

# サービス再起動
./scripts/manage-services.sh restart

# ログ表示
./scripts/manage-services.sh logs

# ヘルスチェック
./scripts/manage-services.sh health

# n8n接続用URL表示
./scripts/manage-services.sh test
```

### 自動起動の仕組み

- **LaunchAgent**: macOSの標準機能でPC起動時に自動実行
- **note-mcp-server**: `~/Library/LaunchAgents/com.note-mcp-server.plist`
- **Cloudflare Tunnel**: `~/Library/LaunchAgents/com.cloudflared.note-mcp.plist`
- **ログ管理**: `~/noteMCP/logs/` ディレクトリに保存

### 手動での起動/停止

```bash
# 個別のサービス制御
launchctl start com.note-mcp-server
launchctl stop com.note-mcp-server
launchctl start com.cloudflared.note-mcp
launchctl stop com.cloudflared.note-mcp
```

## 使い方

以下のようなクエリをClaude Desktopで試すことができます。

### 検索と閲覧（認証不要）
- 「noteで『プログラミング』に関する人気記事を検索して」
- 「noteで『プログラミング』の記事を新着順で検索して」
- 「ユーザー『username』の記事を分析して、人気の要因を教えて」
- 「noteでプログラミングに興味があるユーザーとハッシュタグを全体検索して」
- 「プログラミングに関する記事を詳細分析して、エンゲージメントの傾向を教えて」

### 認証ありの場合のみ使える機能
- 「私のnoteの下書き記事一覧を取得して」
- 「下書き記事のID: n12345の編集ページを開きたい」
- 「タイトル『テスト記事』、本文『これはテストです』で下書き記事を作成して」
- 「画像ファイル `/path/to/image.jpg` をnoteにアップロードして」
- 「この画像URL `https://example.com/image.png` をnoteにアップロードして」
- 「私のnoteアカウントの最新記事のPV数を教えて」
- 「この記事にスキをつけて」
- 「この記事にコメントを投稿して」

## 利用可能なツール

このMCPサーバーでは以下のツールが利用できます。

### 検索関連（認証なしで利用可能）
- **search-notes**: キーワードで記事を検索（ソート順は `sort` パラメータで指定可能）
- **search-all**: note全体検索（ユーザー、ハッシュタグ、記事など）
- **analyze-notes**: 記事の詳細分析（競合分析、エンゲージメント分析、コンテンツタイプ分析など）

### 記事関連（認証なしで利用可能）
- **get-note**: 記事IDから詳細情報を取得（下書き記事も取得可能）
- **get-category-notes**: カテゴリーの記事一覧を取得

### ユーザー関連（認証なしで利用可能）
- **search-users**: ユーザーを検索
- **get-user**: ユーザー詳細情報を取得
- **get-user-notes**: ユーザーの記事一覧を取得

### マガジン関連（認証なしで利用可能）
- **search-magazines**: マガジンを検索
- **get-magazine**: マガジンの詳細を取得

### 自分の記事関連（認証必須）
- **get-my-notes**: 自分の記事一覧（下書き含む）を取得
- **post-draft-note**: 下書き記事を投稿・更新（アイキャッチ対応）
- **post-draft-note-with-images**: 🆕 画像付き下書き記事を作成（API経由で画像を本文に挿入、アイキャッチ対応）
- **open-note-editor**: 記事の編集ページURLを生成
- **upload-image**: 画像をアップロード（ファイルパス、URL、Base64から）
- **upload-images-batch**: 複数の画像を一括アップロード

### インタラクション（認証必須）
- **get-comments**: 記事のコメント一覧を取得（認証なしでも可能なケースあり）
- **post-comment**: 記事にコメントを投稿
- **get-likes**: 記事のスキ一覧を取得（認証なしでも可能なケースあり）
- **like-note**: 記事にスキをつける
- **unlike-note**: 記事のスキを削除

### 統計（認証必須）
- **get-stats**: PV統計情報を取得

### メンバーシップ関連（認証必須）
- **get-membership-summaries**: 加入済みメンバーシップ一覧を取得
- **get-membership-plans**: メンバーシッププラン情報を取得
- **get-membership-notes**: メンバーシップの記事一覧を取得

## 制限事項と注意点

このMCPサーバーには以下の制限事項があります。

### APIの制限

- **下書き保存機能（post-draft-note / post-draft-note-with-images）**: 実装済みです。Markdown形式の本文を自動的にnote.com用HTMLに変換します。

### Markdown→HTML変換ルール

Obsidianなどで作成したMarkdownは、以下のルールでnote.com用HTMLに自動変換されます：

| Markdown                 | note.com             | HTML            |
| ------------------------ | -------------------- | --------------- |
| `#` (H1)                 | 大見出し             | `<h2>`          |
| `##` (H2)                | 大見出し             | `<h2>`          |
| `###` (H3)               | 小見出し             | `<h3>`          |
| `####`〜`######` (H4-H6) | 太字                 | `<strong>`      |
| `- item` / `* item`      | 箇条書き             | `<ul><li>`      |
| `1. item`                | 番号付きリスト       | `<ol><li>`      |
| ` ```code``` `           | コードブロック       | `<pre><code>`   |
| `> quote`                | 引用                 | `<blockquote>`  |
| `**bold**`               | 太字                 | `<strong>`      |
| `*italic*`               | 斜体                 | `<em>`          |
| `[text](url)`            | リンク               | `<a href>`      |
| `![[image.png]]`         | 画像（Obsidian形式） | `<figure><img>` |

- **検索結果の上限**: 単一の検索リクエストで取得できる結果は最大20件程度です。より多くの結果を取得する場合は、`start`パラメータを使用してページネーションを行ってください。

- **認証情報の更新**: Cookieベースの認証を使用している場合、Cookieの有効期限（1～2週間程度）が切れると認証が必要な機能が使えなくなります。定期的にCookie値を更新するか、ログイン認証を利用してください。

### 機能の制限

- **analyze-notes ツール**: 記事の詳細分析機能は、note.com APIが提供するデータに基づいています。一部の分析指標（例：実際の閲覧数など）は、APIから提供されない場合は利用できません。

- **ソートパラメータ**: `sort`パラメータでは、`new`（新着順）、`popular`（人気順）、`hot`（急上昇）の3種類のソートが利用できますが、note.comのAPI変更により、一部のソートオプションが機能しない場合があります。

- **get-my-notes**: 下書き記事の取得については、note.comのAPI実装によっては一部の情報が取得できない場合があります。

- **edit-note/publish-note**: 下書き編集や公開機能は、セッションCookieとXSRFトークンで利用可能です。

### 新機能の使用例

#### 画像付き下書き作成ツール（post-draft-note-with-images）

Obsidianプラグインや他のMCPクライアントから、画像付きの記事を簡単に作成できます：

```javascript
// 基本的な使用例
post-draft-note-with-images({
  title: "記事タイトル",
  body: "## 大見出し\n\n本文テキスト\n\n![[image.png]]\n\n### 小見出し\n\n続きの本文",
  images: [
    { fileName: "image.png", base64: "...", mimeType: "image/png" }
  ],
  tags: ["タグ1", "タグ2"],
  eyecatch: { fileName: "thumbnail.png", base64: "...", mimeType: "image/png" }
})
```

**特徴:**
- Markdown形式の本文を自動的にnote.com用HTMLに変換
- `![[image.png]]` 形式のObsidian画像参照を自動認識
- アイキャッチ画像（サムネイル）の設定に対応
- 複数画像の一括アップロード

#### 記事詳細分析ツールの例

```
// 基本的な使用例
analyze-notes(query: "ChatGPT")

// 詳細なオプション指定
analyze-notes(
  query: "AIツール", 
  size: 30, 
  sort: "popular", 
  includeUserDetails: true,
  analyzeContent: true,
  priceRange: "paid"
)

// カテゴリと日付範囲の指定
analyze-notes(
  query: "プログラミング", 
  category: "technology",
  dateRange: "3m",  // 3ヶ月以内
  sort: "new"
)
```

#### ソートパラメータの使用例

```
// 新着順で記事を検索
search-notes(query: "AI", sort: "new")

// 人気順で全体検索
search-all(query: "プログラミング", context: "user,hashtag,note", sort: "popular")

// 急上昇（デフォルト）で検索
search-notes(query: "ChatGPT")
```

## トラブルシューティング

### サーバーが起動しない
- `.env`ファイルが正しく作成され、設定されているか確認してください。`.env.example` をコピーして `.env` を作成し、必要な認証情報が入力されているか確認します。
- Node.jsのバージョンが18以上か確認してください（`node -v`コマンドで確認）。
- 依存パッケージがインストールされているか確認してください（`npm install`を実行）。
- `npm run build`でTypeScriptが正しくビルドできているか確認してください（`npm run start` で本番用サーバーを起動する場合）。

### 認証エラーが発生する
- `.env` ファイルに設定した認証情報（メールアドレス/パスワード、またはCookie値、ユーザーID）が正しいか、最新か確認してください。
- Cookie認証の場合、有効期限が切れている可能性があります。
- 認証が必要な機能であるか確認してください。
- 下書き編集機能は、セッションCookieとXSRFトークンで利用可能です。認証情報が正しく設定されているか確認してください。

### APIエラーが発生する
- note.comのAPI仕様が変更された可能性があります。
- 最新版のサーバーコードを確認するか、エラーが発生した箇所のコードを見直してください。

### デバッグログを確認したい
- デバッグログを有効にするには、プロジェクトルートにある `.env` ファイルに以下の行を追記してください:
  ```env
  DEBUG=true
  ```
- `.env` ファイルが存在しない場合は、上記のインストール手順に従い `.env.example` から作成してください。

### 開発者向け：高速開発モード
リファクタリング版では以下の開発スクリプトが利用できます：

```bash
# TypeScriptファイルを直接実行（ビルド不要、最速）
npm run dev

# ファイル変更を監視して自動的に再ビルド・再起動（開発時に便利）
npm run dev:watch 

# 本番用にビルドして起動
npm run start
```

### モジュールの個別テスト
各モジュールは独立しているため、個別にテスト・デバッグできます（パスは適宜調整してください）：

```bash
# 特定のモジュールをNode.jsで直接実行（ビルド後）
node build/utils/api-client.js 
node build/tools/search-tools.js
```


## 注意事項

- このサーバーはnote.comの非公式APIを利用しています
- APIの仕様変更により、一部または全部の機能が動作しなくなる可能性があります
- Cookie認証は有効期限があるため、定期的に更新が必要ですが、ログイン認証で定期的にトークンは更新できる様にしています。
- note.comの利用規約を遵守して使用してください
- まだまだ発展途上のため、エラー等あるかもしれません。ぜひ見つけたらissueで教えてください。

## ライセンス

MIT
