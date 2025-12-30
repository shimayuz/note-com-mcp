# note MCP Server 完全セットアップガイド

このドキュメントは、**非エンジニアの方でもCursorを使って機械的に設定を完了**できるよう、すべてのコマンドと手順を詳細に記載しています。

---

## 📋 目次

1. [前提条件の確認](#1-前提条件の確認)
2. [Node.js のインストール](#2-nodejs-のインストール)
3. [Git のインストール](#3-git-のインストール)
4. [リポジトリのクローン](#4-リポジトリのクローン)
5. [依存パッケージのインストール](#5-依存パッケージのインストール)
6. [Playwright ブラウザのインストール](#6-playwright-ブラウザのインストール)
7. [プロジェクトのビルド](#7-プロジェクトのビルド)
8. [環境変数の設定](#8-環境変数の設定)
9. [動作確認](#9-動作確認)
10. [MCP クライアント設定](#10-mcp-クライアント設定)
11. [トラブルシューティング](#11-トラブルシューティング)

---

## 1. 前提条件の確認

### 必要なソフトウェア

| ソフトウェア | 必須バージョン | 確認コマンド |
|-------------|---------------|-------------|
| Node.js | v18.0.0 以上 | `node --version` |
| npm | v9.0.0 以上 | `npm --version` |
| Git | 任意 | `git --version` |

---

## 2. Node.js のインストール

### Mac の場合

#### ステップ 2.1: Homebrew がインストールされているか確認

```bash
brew --version
```

**結果が表示されない場合**: Homebrew をインストール

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

#### ステップ 2.2: Node.js をインストール

```bash
brew install node
```

#### ステップ 2.3: インストール確認

```bash
node --version
npm --version
```

両方でバージョン番号が表示されれば成功です。

---

### Windows の場合

#### ステップ 2.1: Node.js 公式サイトからダウンロード

1. ブラウザで https://nodejs.org/ を開く
2. 「LTS」（推奨版）をダウンロード
3. ダウンロードした `.msi` ファイルを実行
4. インストーラーの指示に従って「Next」をクリック
5. インストール完了後、**コマンドプロンプトを再起動**

#### ステップ 2.2: インストール確認

新しいコマンドプロンプトを開いて実行：

```bash
node --version
npm --version
```

両方でバージョン番号が表示されれば成功です。

---

## 3. Git のインストール

### Mac の場合

```bash
# Xcode Command Line Tools をインストール（Git が含まれます）
xcode-select --install
```

ポップアップが表示されたら「インストール」をクリック。

#### 確認

```bash
git --version
```

---

### Windows の場合

1. ブラウザで https://git-scm.com/download/win を開く
2. 自動でダウンロードが始まる
3. ダウンロードした `.exe` ファイルを実行
4. すべてデフォルト設定のまま「Next」→「Install」
5. インストール完了後、**コマンドプロンプトを再起動**

#### 確認

```bash
git --version
```

---

## 4. リポジトリのクローン

### ステップ 4.1: 作業ディレクトリに移動

#### Mac の場合

```bash
cd ~
```

#### Windows の場合

```bash
cd %USERPROFILE%
```

### ステップ 4.2: リポジトリをクローン

```bash
git clone https://github.com/shimayuz/note-com-mcp.git
```

### ステップ 4.3: プロジェクトディレクトリに移動

```bash
cd note-com-mcp
```

### ステップ 4.4: クローン成功の確認

```bash
ls -la
```

`package.json` や `src` フォルダが表示されれば成功です。

---

## 5. 依存パッケージのインストール

### ステップ 5.1: npm install を実行

```bash
npm install
```

**期待される出力**: 
```
added XXX packages in XXs
```

### ステップ 5.2: インストール確認

```bash
ls node_modules
```

多数のフォルダが表示されれば成功です。

---

## 6. Playwright ブラウザのインストール

note.com への自動ログイン機能に必要です。

### ステップ 6.1: Playwright ブラウザをインストール

```bash
npx playwright install
```

**期待される出力**:
```
Downloading Chromium XXX...
Downloading Firefox XXX...
Downloading Webkit XXX...
```

### ステップ 6.2: システム依存ライブラリのインストール（Linux/WSL の場合のみ）

```bash
npx playwright install-deps
```

---

## 7. プロジェクトのビルド

### ステップ 7.1: TypeScript をビルド

```bash
npm run build
```

**期待される出力**:
```
（エラーメッセージなし、または空の出力）
```

### ステップ 7.2: ビルド成功の確認

```bash
ls build
```

`note-mcp-server.js` が表示されれば成功です。

---

## 8. 環境変数の設定

### ステップ 8.1: .env ファイルを作成

#### Mac の場合

```bash
touch .env
```

#### Windows（PowerShell）の場合

```powershell
New-Item -Path .env -ItemType File
```

### ステップ 8.2: .env ファイルを編集

テキストエディタで `.env` ファイルを開き、以下の内容を記入：

```env
# note.com 認証情報
NOTE_EMAIL=あなたのメールアドレス
NOTE_PASSWORD=あなたのパスワード

# 以下はオプション（自動取得される）
# NOTE_SESSION_V5=
# NOTE_XSRF_TOKEN=
# NOTE_USER_ID=
```

**重要**: 
- `あなたのメールアドレス` と `あなたのパスワード` を実際の値に置き換えてください
- このファイルは `.gitignore` に含まれているため、Git にはコミットされません

### ステップ 8.3: 認証情報なしでの起動（推奨）

`.env` ファイルを作成せずに起動すると、ブラウザが自動で開き、手動でログインできます。

```bash
npm run start
```

1. Chromium ブラウザが自動で開く
2. note.com のログインページが表示される
3. **手動でメールアドレスとパスワードを入力してログイン**
4. ログイン完了を検知し、セッション情報を自動取得
5. ブラウザが自動で閉じる
6. MCP サーバーが起動完了

---

## 9. 動作確認

### ステップ 9.1: サーバーを起動

```bash
npm run start
```

**期待される出力**:
```
MCP Server started
```

### ステップ 9.2: 終了

`Ctrl + C` を押してサーバーを停止します。

---

## 10. MCP クライアント設定

### Cursor の場合

#### ステップ 10.1: プロジェクトの絶対パスを確認

```bash
pwd
```

出力例: `/Users/username/note-com-mcp` または `C:\Users\username\note-com-mcp`

#### ステップ 10.2: MCP 設定ファイルを編集

##### Mac の場合

設定ファイルのパス: `~/.cursor/mcp.json`

```bash
# ファイルが存在しない場合は作成
mkdir -p ~/.cursor
touch ~/.cursor/mcp.json
```

##### Windows の場合

設定ファイルのパス: `%USERPROFILE%\.cursor\mcp.json`

```powershell
# フォルダが存在しない場合は作成
New-Item -Path "$env:USERPROFILE\.cursor" -ItemType Directory -Force
New-Item -Path "$env:USERPROFILE\.cursor\mcp.json" -ItemType File -Force
```

#### ステップ 10.3: 設定ファイルの内容

`mcp.json` に以下の内容を記入：

##### Mac の場合

```json
{
  "mcpServers": {
    "note-api": {
      "command": "node",
      "args": ["/Users/あなたのユーザー名/note-com-mcp/build/note-mcp-server.js"],
      "env": {
        "NOTE_EMAIL": "your_email@example.com",
        "NOTE_PASSWORD": "your_password",
        "NOTE_USER_ID": "your_note_user_id"
      }
    }
  }
}
```

##### Windows の場合

```json
{
  "mcpServers": {
    "note-api": {
      "command": "node",
      "args": ["C:\\Users\\あなたのユーザー名\\note-com-mcp\\build\\note-mcp-server.js"],
      "env": {
        "NOTE_EMAIL": "your_email@example.com",
        "NOTE_PASSWORD": "your_password",
        "NOTE_USER_ID": "your_note_user_id"
      }
    }
  }
}
```

**重要な置き換え**:
- `あなたのユーザー名` → 実際のユーザー名
- `your_email@example.com` → note.com のメールアドレス
- `your_password` → note.com のパスワード
- `your_note_user_id` → note.com のユーザーID（オプション）

#### ステップ 10.4: Cursor を再起動

設定を反映するため、Cursor を完全に終了してから再度起動してください。

---

### Claude Desktop の場合

#### 設定ファイルのパス

##### Mac

`~/Library/Application Support/Claude/claude_desktop_config.json`

##### Windows

`%APPDATA%\Claude\claude_desktop_config.json`

#### 設定内容

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

---

## 11. トラブルシューティング

### エラー: `npm: command not found`

**原因**: Node.js がインストールされていないか、パスが通っていない

**解決策**: 
1. Node.js を再インストール
2. ターミナル/コマンドプロンプトを再起動

---

### エラー: `ENOENT: no such file or directory`

**原因**: 指定したファイルパスが間違っている

**解決策**:
1. `pwd` コマンドで現在のディレクトリを確認
2. `ls build` でビルドファイルの存在を確認
3. MCP 設定ファイルのパスを修正

---

### エラー: `playwright install` で失敗

**原因**: システム依存ライブラリが不足

**解決策**:

```bash
npx playwright install-deps
```

---

### エラー: `Cannot find module`

**原因**: ビルドが完了していない

**解決策**:

```bash
npm run build
```

---

### 認証エラー: セッションが切れた

**原因**: Cookie の有効期限切れ（約1〜2週間）

**解決策**:
1. `.env` ファイルを削除または空にする
2. `npm run start` で再度ブラウザログイン
3. 新しいセッション情報が自動取得される

---

## 📝 設定完了チェックリスト

以下のすべてにチェックが入れば設定完了です：

- [ ] Node.js v18 以上がインストールされている
- [ ] Git がインストールされている
- [ ] リポジトリがクローンされている
- [ ] `npm install` が成功している
- [ ] `npx playwright install` が成功している
- [ ] `npm run build` が成功している
- [ ] `.env` ファイルまたはブラウザログインで認証設定済み
- [ ] `npm run start` でサーバーが起動する
- [ ] MCP クライアント（Cursor/Claude）の設定ファイルが作成済み
- [ ] MCP クライアントを再起動済み

---

## 🎉 セットアップ完了

これで note MCP Server の設定が完了しました！

Cursor や Claude Desktop から以下のような質問ができます：

```
noteで「プログラミング」に関する人気記事を検索して
```

```
タイトル「技術メモ」で下書きを作成して
```
