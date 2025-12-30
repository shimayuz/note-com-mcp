# Cursor 自動セットアップ実行ガイド

このドキュメントは、Cursorに「セットアップして」と指示するだけで自動実行されるコマンドシーケンスを定義しています。

---

## 🎯 使い方

Cursorで以下のように指示してください：

```
このプロジェクトをセットアップして
```

または

```
note MCP Serverを使えるように設定して
```

---

## 📋 自動実行シーケンス

### ステップ 1: 環境確認

```bash
# Node.js バージョン確認
node --version

# npm バージョン確認  
npm --version

# Git バージョン確認
git --version
```

**確認ポイント**:
- Node.js v18.0.0 以上
- npm v9.0.0 以上
- Git がインストール済み

---

### ステップ 2: 依存パッケージインストール

```bash
# npm パッケージインストール
npm install
```

**期待される出力**:
```
added XXX packages in XXs
```

**エラー時の対処**:
```bash
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

---

### ステップ 3: Playwright ブラウザインストール

```bash
# Playwright ブラウザダウンロード
npx playwright install
```

**期待される出力**:
```
Downloading Chromium XXX...
Downloading Firefox XXX...
Downloading Webkit XXX...
```

**Linux/WSL の場合は追加実行**:
```bash
npx playwright install-deps
```

---

### ステップ 4: プロジェクトビルド

```bash
# TypeScript ビルド
npm run build
```

**期待される出力**:
- エラーなし（空の出力）

**確認コマンド**:
```bash
ls build/note-mcp-server.js
```

---

### ステップ 5: 環境変数設定

```bash
# .env.sample から .env を作成
cp .env.sample .env
```

**または空の .env ファイルを作成**:
```bash
touch .env
```

---

### ステップ 6: 動作確認

```bash
# サーバー起動テスト
npm run start
```

**期待される動作**:
1. `.env` に認証情報がない場合 → ブラウザが開く
2. 手動でログイン
3. セッション取得後、サーバー起動

**終了**: `Ctrl + C`

---

### ステップ 7: MCP クライアント設定

#### 7.1 プロジェクトパス取得

```bash
pwd
```

出力例: `/Users/username/noteMCP`

#### 7.2 OS検出

```bash
uname -s
```

- `Darwin` → macOS
- `Linux` → Linux
- それ以外 → Windows

#### 7.3 MCP 設定ファイル作成

##### macOS の場合

```bash
# ディレクトリ作成
mkdir -p ~/.cursor

# 設定ファイル作成
cat > ~/.cursor/mcp.json << 'EOF'
{
  "mcpServers": {
    "note-api": {
      "command": "node",
      "args": ["PROJECT_PATH/build/note-mcp-server.js"],
      "env": {}
    }
  }
}
EOF
```

**PROJECT_PATH を実際のパスに置換**:
```bash
sed -i '' "s|PROJECT_PATH|$(pwd)|g" ~/.cursor/mcp.json
```

##### Windows (PowerShell) の場合

```powershell
# ディレクトリ作成
New-Item -Path "$env:USERPROFILE\.cursor" -ItemType Directory -Force

# 設定ファイル作成
$projectPath = (Get-Location).Path -replace '\\', '\\\\'
$config = @"
{
  "mcpServers": {
    "note-api": {
      "command": "node",
      "args": ["$projectPath\\build\\note-mcp-server.js"],
      "env": {}
    }
  }
}
"@
$config | Out-File -FilePath "$env:USERPROFILE\.cursor\mcp.json" -Encoding utf8
```

---

## ✅ セットアップ完了確認

以下のコマンドですべてが正常か確認：

```bash
# 1. ビルドファイル存在確認
test -f build/note-mcp-server.js && echo "✓ ビルド成功" || echo "✗ ビルド失敗"

# 2. node_modules 存在確認
test -d node_modules && echo "✓ パッケージインストール成功" || echo "✗ パッケージ未インストール"

# 3. MCP設定ファイル確認 (Mac)
test -f ~/.cursor/mcp.json && echo "✓ MCP設定完了" || echo "✗ MCP未設定"
```

---

## 🔧 トラブルシューティング

### npm install が失敗する

```bash
# Node.js バージョン確認
node --version
# v18未満の場合はアップグレードが必要

# キャッシュクリア
npm cache clean --force

# 再インストール
rm -rf node_modules package-lock.json
npm install
```

### playwright install が失敗する

```bash
# 依存ライブラリインストール
npx playwright install-deps

# 再インストール
npx playwright install
```

### build が失敗する

```bash
# TypeScript コンパイルエラーの詳細確認
npx tsc --noEmit

# node_modules 再インストール
rm -rf node_modules
npm install
npm run build
```

### MCP が認識されない

1. Cursor を完全に終了
2. 設定ファイルの内容を確認

```bash
cat ~/.cursor/mcp.json
```

3. パスが正しいか確認
4. Cursor を再起動

---

## 📝 完了メッセージテンプレート

セットアップ完了後、Cursorは以下のように報告する：

```
◤◢◤◢◤◢◤◢◤◢◤◢◤◢
✅ セットアップ完了

📦 インストール済み:
- npm パッケージ
- Playwright ブラウザ

🔨 ビルド済み:
- build/note-mcp-server.js

⚙️ MCP設定:
- ~/.cursor/mcp.json 作成済み

🚀 次のステップ:
1. Cursor を再起動
2. 「noteで記事を検索して」と試す

💡 認証設定:
サーバー起動時にブラウザが開くので、
note.com にログインしてください。
◤◢◤◢◤◢◤◢◤◢◤◢◤◢
```
