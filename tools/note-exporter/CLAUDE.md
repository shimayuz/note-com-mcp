# Note Exporter - Cascade Orchestration Guide

## 概要

Markdown記事をnote.comの下書きにエクスポートするAuto Orchestrationツール。

## Auto Orchestration Flow

### 基本フロー

```
1. Markdownファイル読み込み
2. convertMarkdownToNoteHtml() でHTML変換
3. extractMetadata() でタイトル・タグ抽出
4. mcp6_post-draft-note で下書き投稿
```

### Cascade内での実行手順

#### 方法1: 直接変換（推奨）

```typescript
// 1. ファイル読み込み
const content = readFileSync('/path/to/article.md', 'utf-8');

// 2. メタデータ抽出
const metadata = extractMetadata(content);
const title = metadata.title || 'タイトル';
const tags = metadata.tags;

// 3. HTML変換
const html = convertMarkdownToNoteHtml(content, { removeFirstH1: true });

// 4. note MCPで下書き投稿
mcp6_post-draft-note({
  title: title,
  body: html,
  tags: tags
});
```

#### 方法2: CLIツール使用

```bash
# 変換のみ
npx tsx src/cli.ts convert ./article.md -v

# 下書きデータ準備（JSON出力）
npx tsx src/cli.ts prepare ./article.md
```

## ファイル配置規則

- **入力**: `07_Outputs/note-com/*.md`
- **出力**: `07_Outputs/note-com/*_note.html`

## Markdown形式

### Frontmatter

```yaml
---
title: 記事タイトル
tags: [タグ1, タグ2, タグ3]
---
```

### 対応要素

- 見出し (h1-h6)
- 段落、太字、斜体
- リンク、画像（コメント化）
- コードブロック、インラインコード
- リスト（順序付き/なし）
- 引用、水平線

## 注意事項

1. **タイトル**: Frontmatterの`title`または最初のH1から自動抽出
2. **タグ**: 最大10個まで
3. **画像**: note.comでは別途アップロードが必要（HTMLコメントとして残る）
4. **下書き状態**: `isDraft: true`がデフォルト
