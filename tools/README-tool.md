# Contents Engine 5Days - Tools

このディレクトリには、コンテンツ制作を自動化するためのツール群が含まれています。

---

## Note Exporter

Markdown記事をnote.com用HTMLに変換し、**画像を含めて**note MCPを使った下書きエクスポートを自動化するツール。

### ✨ 主な機能

- **Markdown → HTML変換**: note.comに最適化
- **Obsidian画像対応**: `![[image.png]]` 形式を自動検出
- **note MCP連携**: 画像アップロード → 下書き投稿を自動化
- **Vault探索**: Obsidian Vault内の画像を自動で見つける

### 📦 セットアップ

```bash
cd tools/note-exporter
npm install
```

### 🚀 基本的な使い方

#### 1. 単一ファイルの変換

```bash
npx tsx src/cli.ts convert ./path/to/article.md
```

**オプション:**
- `-o, --output <dir>` : 出力ディレクトリ指定
- `-t, --tags <tags>` : タグ指定（カンマ区切り）
- `-v, --verbose` : 詳細出力（MCP用データも表示）

**例:**
```bash
# 詳細出力付きで変換
npx tsx src/cli.ts convert "../../07_Outputs/note-com/記事.md" -v

# カスタムタグを指定
npx tsx src/cli.ts convert ./article.md -t "AI,自動化,n8n"
```

#### 2. 下書きエクスポート準備

note MCPで使用できるJSONデータを生成します。

```bash
npx tsx src/cli.ts prepare ./path/to/article.md
```

**出力:**
- `*_export.json` : タイトル、タグ、HTML本文を含むJSONファイル

#### 3. 一括変換

複数のMarkdownファイルを一度に変換します。

```bash
npx tsx src/cli.ts batch "../../07_Outputs/note-com/*.md"
```

---

### 📝 Markdown形式

#### Frontmatter対応

```markdown
---
title: 記事タイトル
tags:
  - タグ1
  - タグ2
  - タグ3
description: 記事の説明文
---

# 本文の見出し

本文内容...
```

**タグの書き方（どちらでもOK）:**

```yaml
# YAML配列形式
tags:
  - タグ1
  - タグ2

# インライン配列形式
tags: [タグ1, タグ2, タグ3]
```

#### 対応要素

| 要素 | Markdown | 変換後HTML |
|------|----------|------------|
| 見出し | `# H1` ~ `###### H6` | `<h1>` ~ `<h6>` |
| 太字 | `**text**` | `<b>text</b>` |
| 斜体 | `*text*` | `<i>text</i>` |
| リンク | `[text](url)` | `<a href="url">text</a>` |
| 画像 | `![alt](url)` | `<!-- 画像: alt -->` |
| コードブロック | ` ```code``` ` | `<pre><code>code</code></pre>` |
| インラインコード | `` `code` `` | `<code>code</code>` |
| 順序なしリスト | `- item` | `<ul><li>item</li></ul>` |
| 順序付きリスト | `1. item` | `<ol><li>item</li></ol>` |
| 引用 | `> quote` | `<blockquote>quote</blockquote>` |
| 水平線 | `---` | `<hr>` |

---

### 🖼️ 画像付き下書きエクスポート（Auto Orchestration）

Obsidianの画像を含む記事をnote.comに下書きエクスポートする完全フロー。

#### Cascade/Windsurf内での実行手順

```
1. orchestrateExport() でMarkdown解析 + 画像検出
2. 画像ごとに mcp6_upload-image でnote.comにアップロード
3. アップロードURLをimageUrlMapに登録
4. regenerateBodyWithImages() で画像URL入りHTMLを再生成
5. mcp6_post-draft-note で下書き投稿
```

#### 実行例（Cascade内）

**ユーザー**: `07_Outputs/note-com/記事.md` を画像付きでnoteに下書きエクスポートして

**Cascade**:
```typescript
// Step 1: Markdown解析 + 画像検出
const result = orchestrateExport('./07_Outputs/note-com/記事.md');
console.log(`画像 ${result.images.length} 件検出`);

// Step 2: 画像をnote.comにアップロード
for (const image of result.images) {
  if (image.localPath) {
    const uploaded = await mcp6_upload-image({ imagePath: image.localPath });
    result.imageUrlMap.set(image.fileName, uploaded.url);
  }
}

// Step 3: 画像URL入りHTMLを再生成
const bodyWithImages = regenerateBodyWithImages(
  result.sourcePath,
  result.imageUrlMap
);

// Step 4: 下書き投稿
await mcp6_post-draft-note({
  title: result.title,
  body: bodyWithImages,
  tags: result.tags
});
```

#### 画像形式の対応

| 形式 | 例 | 対応 |
|------|-----|------|
| Obsidian Wikilink | `![[image.png]]` | ✅ |
| Wikilink + alt | `![[image.png\|説明]]` | ✅ |
| 標準Markdown | `![alt](path/to/image.png)` | ✅ |
| 外部URL | `![alt](https://...)` | ✅ そのまま使用 |

#### 画像の探索場所

1. Markdownファイルと同じディレクトリ
2. Obsidian Vaultルート（`.obsidian`フォルダがある場所）
3. 一般的な画像フォルダ: `attachments/`, `images/`, `assets/`, `media/`

---

### 📁 ファイル配置規則

```
07_Outputs/
└── note-com/
    ├── 記事.md              # 入力: Markdownファイル
    ├── 記事_note.html       # 出力: 変換済みHTML
    └── 記事_export.json     # 出力: MCP用データ
```

---

### ⚠️ 注意事項

1. **タイトル**: Frontmatterの`title`または最初のH1から自動抽出
2. **タグ**: 最大10個まで（note.comの制限）
3. **画像**: note.comでは別途アップロードが必要（HTMLコメントとして残る）
4. **下書き状態**: デフォルトで下書きとして保存

---

### 🛠️ トラブルシューティング

#### 「ファイルが見つかりません」エラー

```bash
# 絶対パスで指定
npx tsx src/cli.ts convert /Users/.../07_Outputs/note-com/記事.md
```

#### タグが抽出されない

Frontmatterの形式を確認:
```yaml
---
tags:
  - タグ1  # ハイフンの後にスペースが必要
---
```

#### 文字化け

ファイルがUTF-8で保存されていることを確認してください。

---

### 📚 関連ドキュメント

- `tools/note-exporter/README.md` : 詳細な技術ドキュメント
- `tools/note-exporter/CLAUDE.md` : Cascade連携ガイド
