# Obsidian to note Publisher

ObsidianのMarkdown記事をワンクリックでnote.comに公開するツール群。

## 🎉 v1.2.0 新機能

**API経由での画像挿入**が追加されました！

- `--api` オプションで安定・高速な画像挿入が可能
- Playwrightなしで動作（ブラウザ不要）
- 画像をnote.comのS3に直接アップロード

```bash
# 推奨：API経由モード（安定・高速）
obsidian-to-note ./article.md --api

# 従来：Playwrightモード
obsidian-to-note ./article.md --headless
```

## 🎯 概要

2つのコンポーネントで構成されるハイブリッドな配布方式：

1. **CLIツール** - 実際の投稿処理を行う本体
2. **Obsidianプラグイン** - CLIを呼び出す軽量なUI

## 📦 インストール

### 1. CLIツールのインストール

```bash
# npmでグローバルインストール（推奨）
npm install -g obsidian-to-note-publisher

# またはローカルインストール
npm install obsidian-to-note-publisher
```

### 2. 初期セットアップ

```bash
# 設定ファイルを生成
obsidian-to-note --init
```

`.env`ファイルに認証情報を設定：
```env
NOTE_EMAIL=your-email@example.com
NOTE_PASSWORD=your-password
```

### 3. Obsidianプラグインのインストール

1. [Releases](https://github.com/shimayuz/obsidian-to-note-publisher/releases) から最新版をダウンロード
2. ZIPを展開し、`obsidian-to-note-publisher` フォルダを `.obsidian/plugins/` に配置
3. Obsidianを再起動し、設定からプラグインを有効化

## 🚀 使い方

### CLIで直接実行

```bash
# 基本的な使い方
obsidian-to-note ./article.md

# ヘッドレスモード（バックグラウンド実行）
obsidian-to-note ./article.md --headless

# .envファイルを指定
obsidian-to-note ./article.md --env /path/to/.env
```

### Obsidianから実行

1. 公開したいMarkdownファイルを開く
2. コマンドパレット（Cmd/Ctrl+P）で「noteに公開」を選択
3. またはリボンの送信アイコンをクリック
4. 自動でCLIが実行され、note.comに下書きが保存される

## 📄 対応形式

- **Obsidian画像**: `![[image.png]]` や `![[image.png|説明]]`
- **標準Markdown**: `![alt](path/to/image.png)`
- **Frontmatter**: タイトルとタグを自動抽出

## ⚙️ 環境変数

### Playwrightモード（従来）

| 変数名        | 説明                       | 必須 |
| ------------- | -------------------------- | ---- |
| NOTE_EMAIL    | note.comのメールアドレス   | ✅    |
| NOTE_PASSWORD | note.comのパスワード       | ✅    |
| DOTENV_PATH   | .envファイルのパス（任意） | ❌    |

### API経由モード（v1.2.0〜）

| 変数名          | 説明                       | 必須 |
| --------------- | -------------------------- | ---- |
| NOTE_SESSION_V5 | note.comのセッションCookie | ✅    |
| NOTE_XSRF_TOKEN | note.comのXSRFトークン     | ✅    |

**セッション情報の取得方法:**

このプラグインは [note MCP](https://github.com/shimayuz/note-com-mcp) と組み合わせて使用します。
セッション情報はnote MCPのPlaywrightセッションキャプチャ機能で自動取得されます。

1. note MCPをセットアップ（[README参照](https://github.com/shimayuz/note-com-mcp)）
2. note MCPがPlaywrightでnote.comにログインし、セッションをキャプチャ
3. `.env`ファイルに `NOTE_SESSION_V5` と `NOTE_XSRF_TOKEN` が自動設定される

## 🔧 オプション

| オプション | 説明                                       |
| ---------- | ------------------------------------------ |
| --api      | API経由で画像挿入（推奨：安定・高速）      |
| --headless | ブラウザを非表示で実行（Playwrightモード） |
| --help     | ヘルプを表示                               |
| --env      | .envファイルのパスを指定                   |

## 📝 Markdown形式

```markdown
---
title: 記事タイトル
tags: [タグ1, タグ2, タグ3]
---

# 記事の本文

本文内容...

![[image.png]]

## 見出し2

- リスト項目1
- リスト項目2
```

## 🛠️ トラブルシューティング

### 「ファイルが見つかりません」エラー
- 絶対パスで指定してください
- 画像ファイルはMarkdownファイルと同じディレクトリに配置してください

### ログインできない
- .envファイルの認証情報を確認してください
- note.comで2段階認証を有効にしている場合は無効にしてください

### プライベートリポジトリのアクセス
- GitHub Personal Access Tokenが必要です
- `~/.npmrc` に以下を設定：
  ```
  //registry.npmjs.org/:_authToken=${NPM_TOKEN}
  ```

## 📄 ライセンス

MIT
