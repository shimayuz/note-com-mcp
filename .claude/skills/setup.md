---
name: setup
description: note MCP Server の自動セットアップ。リポジトリをクローンした後に実行し、環境構築からMCP設定まで完了させる。
---

# note MCP Server セットアップスキル

このスキルは、note-com-mcpリポジトリをクローンした直後に実行し、セットアップを完了させるものです。
以下のステップを順番に実行してください。各ステップでエラーが出たら、エラー対応セクションを参照して解決してから次へ進んでください。

## 前提条件

- このスキルは note-com-mcp リポジトリのルートディレクトリで実行すること
- `package.json` が存在することを最初に確認すること

## Step 1: 環境チェック

以下のコマンドを実行して環境を確認する。

```bash
node --version
npm --version
```

**判定:**
- Node.js v18未満 → 「Node.js v18以上が必要です。https://nodejs.org/ からインストールしてください」と案内して停止
- Node.js 未インストール → Mac: `brew install node`、Windows: https://nodejs.org/ を案内して停止
- npm 未インストール → Node.jsと一緒にインストールされるはずなので、Node.jsの再インストールを案内

## Step 2: npm install

```bash
npm install
```

**成功判定:** エラーなく完了すること

**失敗時:**
```bash
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

## Step 3: Playwright インストール

```bash
npx playwright install
```

Playwrightはnote.comへの自動ログイン（セッション取得）に使用する。

**Linux/WSLの場合は追加で実行:**
```bash
npx playwright install-deps
```

## Step 4: ビルド

```bash
npm run build
```

**成功判定:** `build/note-mcp-server.js` ファイルが生成されること

**失敗時:**
```bash
rm -rf node_modules
npm install
npm run build
```

## Step 5: .env ファイル作成

`.env` ファイルが存在しない場合のみ作成する。

```bash
cp .env.sample .env
```

<CRITICAL>
ここで必ずユーザーに以下を伝えて、入力を待つこと。絶対にスキップしてはいけない。

---

`.env` ファイルを作成しました。**以下の2項目をあなたのnoteアカウント情報に書き換えてください。**

`.env` ファイルを開いて、以下のコメントアウトを外し、自分の情報を入力してください:

```
NOTE_EMAIL=your-email@example.com
NOTE_PASSWORD=your-password
```

入力が終わったら「done」「完了」「OK」などと教えてください。

**注意:**
- `.env` ファイルはあなたのPC内だけで使うものです。GitHubにはアップロードされません（.gitignoreで除外済み）
- SNSやブログに `.env` の中身をスクショで載せないでください
- メール/パスワードを入力せず、初回起動時にブラウザでログインする方法もあります（Step 7で自動的にブラウザが開きます）

---

ユーザーの応答を待ってから次のステップに進むこと。
</CRITICAL>

## Step 6: MCP クライアント設定

ユーザーがどのAIツールを使っているか確認し、適切なMCP設定ファイルを作成する。

### 自動検出ロジック

1. `~/.claude/` ディレクトリが存在する → Claude Code ユーザーの可能性
2. `~/.cursor/` ディレクトリが存在する → Cursor ユーザーの可能性
3. 両方存在する → ユーザーに確認する
4. どちらも存在しない → ユーザーに確認する

### Claude Desktop の場合

設定ファイルパス:
- **Mac:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

既存の設定がある場合はバックアップを取ってから、`mcpServers` に以下を追加（マージ）する:

```json
{
  "mcpServers": {
    "note-api": {
      "command": "node",
      "args": ["<PROJECT_PATH>/build/note-mcp-server.js"],
      "env": {}
    }
  }
}
```

`<PROJECT_PATH>` は `pwd` の出力に置換すること。

### Claude Code の場合

Claude Codeはプロジェクト内の `.mcp.json` を自動で読み込む。
プロジェクトルートに `.mcp.json` が存在しなければ作成する:

```json
{
  "mcpServers": {
    "note-api": {
      "command": "node",
      "args": ["./build/note-mcp-server.js"],
      "env": {}
    }
  }
}
```

### Cursor の場合

設定ファイルパス:
- **Mac/Linux:** `~/.cursor/mcp.json`
- **Windows:** `%USERPROFILE%\.cursor\mcp.json`

既存の設定がある場合はバックアップを取ってから、`mcpServers` に追加（マージ）する:

```json
{
  "mcpServers": {
    "note-api": {
      "command": "node",
      "args": ["<PROJECT_PATH>/build/note-mcp-server.js"],
      "env": {}
    }
  }
}
```

`<PROJECT_PATH>` は `pwd` の出力に置換すること。Windowsの場合はバックスラッシュをエスケープ（`\\`）すること。

## Step 7: 起動テスト

HTTPモードでサーバーを起動して動作確認する。

```bash
npm run start:http
```

**期待される動作:**
1. 「Starting note API MCP Server...」と表示される
2. Playwrightが起動し、ブラウザが自動で開く
3. ユーザーがnote.comにログインする（Step 5でメール/パスワードを設定済みなら自動ログイン）
4. ログイン完了後、ブラウザが自動で閉じる
5. 「HTTP MCP server listening on 127.0.0.1:3000」のようなメッセージが表示される

**ユーザーへの案内:**
- ブラウザが開いたら、note.comにログインしてください
- ログイン完了後、しばらく待つと自動でブラウザが閉じます（最大2分半）
- サーバーが起動したら `Ctrl + C` で停止してOKです

**ポート競合時:**
```bash
MCP_HTTP_PORT=3001 node build/note-mcp-server.js
```

## Step 8: 完了報告

すべてのステップが完了したら、以下を報告する:

---

**セットアップ完了!**

**インストール済み:**
- npm パッケージ
- Playwright ブラウザ

**ビルド済み:**
- build/note-mcp-server.js

**MCP設定:**
- [作成した設定ファイルのパス]

**使い方:**

stdioモード（Cursor / Claude Desktop からの自動接続）:
- AIツールを再起動すれば自動でMCPサーバーに接続されます

HTTPモード（Obsidianプラグイン等から接続する場合）:
```bash
npm run start:http
```
- HTTPサーバーはObsidianを使っている間は起動したままにしてください
- デフォルトポートは3000です

---

## エラー対応

### EADDRINUSE（ポート使用中）

```bash
lsof -ti:3000 | xargs kill -9
npm run start:http
```

または別ポートで起動:
```bash
MCP_HTTP_PORT=3001 node build/note-mcp-server.js
```

### Playwright がタイムアウト

```bash
npx playwright install --force
```

### MCP が認識されない

1. AIツールを完全終了して再起動
2. 設定ファイルのパスが正しいか確認
3. `node build/note-mcp-server.js` を直接実行してエラーがないか確認
