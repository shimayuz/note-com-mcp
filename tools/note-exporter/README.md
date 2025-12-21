# Note Exporter

Markdown記事をnote.com用HTMLに変換し、note MCPを使った下書きエクスポートを自動化するツール。

## 機能

- **Markdown → HTML変換**: note.comの記事形式に最適化されたHTML出力
- **メタデータ抽出**: Frontmatterからタイトル・タグを自動抽出
- **下書きエクスポート準備**: note MCP連携用のデータ生成
- **一括変換**: 複数ファイルの一括処理

## インストール

```bash
cd tools/note-exporter
npm install
```

## 使い方

### 1. 単一ファイルの変換

```bash
npm run export convert ./path/to/article.md
```

オプション:
- `-o, --output <dir>`: 出力ディレクトリ指定
- `-t, --tags <tags>`: タグ指定（カンマ区切り）
- `-v, --verbose`: 詳細出力（MCP用データも表示）

### 2. 下書きエクスポート準備

```bash
npm run export prepare ./path/to/article.md
```

これにより、note MCPで使用できる形式のJSONファイルが生成されます。

### 3. 一括変換

```bash
npm run export batch "./07_Outputs/note-com/*.md"
```

## Markdown形式

### Frontmatter対応

```markdown
---
title: 記事タイトル
tags: [タグ1, タグ2, タグ3]
description: 記事の説明文
---

# 本文の見出し

本文内容...
```

### 対応要素

- 見出し (h1-h6)
- 段落
- 太字・斜体
- リンク
- 画像（コメント化）
- コードブロック
- インラインコード
- 順序付き/順序なしリスト
- 引用
- 水平線

## Auto Orchestration Flow

1. **Markdownファイル作成** → `07_Outputs/note-com/` に配置
2. **変換実行** → `npm run export convert <file>`
3. **note MCP連携** → 生成されたHTMLを `mcp6_post-draft-note` で下書き投稿

### Windsurf/Cascade連携

Cascadeから直接以下のフローを実行可能:

```
1. Markdownファイルを読み込み
2. convertMarkdownToNoteHtml() でHTML変換
3. extractMetadata() でタイトル・タグ抽出
4. mcp6_post-draft-note で下書き投稿
```

## 開発

```bash
# 開発モード
npm run dev convert ./test.md

# ビルド
npm run build
```

## ライセンス

MIT
