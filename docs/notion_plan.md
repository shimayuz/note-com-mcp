# Notion → note.com Integration 実装プラン書（完全改訂版）

## 目次
1. プロジェクト概要
2. 過去の問題分析と対策
3. アーキテクチャ設計
4. ファイル構成
5. 詳細実装仕様
6. 書式変換マッピング
7. エラーハンドリング戦略
8. テスト計画
9. 実装フェーズ
10. リスクと緩和策
11. 付録: 依存パッケージ

---

## 1. プロジェクト概要

### 1.1 目的
Notion のページ/データベースから記事を取得し、note.com の下書きとして投稿する機能を提供する。

### 1.2 スコープ
| 項目 | 対象 |
| --- | --- |
| In Scope | Notionページ→note.com下書き変換、画像移行、基本ブロック対応 |
| Out of Scope | 双方向同期、リアルタイム監視、データベースビュー再現 |

### 1.3 成果物（このリポジトリ構成に合わせた）
- `src/tools/notion-tools.ts` - MCPツール定義
- `src/utils/notion-client.ts` - Notion API クライアント
- `src/utils/notion-block-parser.ts` - ブロックパーサー
- `src/utils/notion-to-note-formatter.ts` - 書式変換（IR → Markdown）
- `src/types/notion-types.ts` - Notion関連型定義
- `src/config/notion-config.ts` - Notion設定
- `src/tools/index.ts` - Notionツール登録追加
- `src/config/environment.ts` - NOTION_TOKEN 追加
- `.env.sample` - NOTION_TOKEN 例追加
- `package.json` - `@notionhq/client` 追加

---

## 2. 過去の問題分析と対策

### 2.1 認証関連の問題
| 過去の問題 | 原因 | Notion Integration での対策 |
| --- | --- | --- |
| Playwrightログイン検知が不安定 | ブラウザ動作の仕様変化 | Notion API は Bearer Token 認証のみ → Playwright 不要 |
| 4種類のトークン管理が複雑 | note.com の認証仕様 | Notion は NOTION_TOKEN 1種類のみ |
| セッション永続化の信頼性問題 | Cookie の有効期限管理 | Notion Token は長期有効（手動失効まで） |

設計方針: **Notion 側は単純なトークン認証を採用し、認証複雑性を回避**。

### 2.2 書式変換の問題
| 過去の問題 | 原因 | 対策 |
| --- | --- | --- |
| Markdown変換の状態管理が複雑 | 行単位処理 + リスト状態保持 | AST（中間表現）パターン採用 |
| 複数画像形式の混在対応 | Obsidian/Markdown/プレースホルダー | Notion Block → IR → Markdown → note.com形式 |
| 見出しレベルのマッピング混乱 | H1→H2変換ルールが暗黙的 | 明示的マッピングテーブル定義 |

設計方針: **2段階変換（Notion Block → IR → Markdown）で責務分離**。

### 2.3 画像処理の問題
| 過去の問題 | 原因 | 対策 |
| --- | --- | --- |
| Presigned URL の個別取得が非効率 | バッチAPIなし | 既存制約として受け入れ（並列化で対応） |
| S3 レスポンス 204 の判定漏れ | 成功判定ロジックのバグ | 既存修正済みコードを流用 |

設計方針: **既存の `post-draft-note-with-images` のアップロードロジックを流用**。

### 2.4 API呼び出しの問題
| 過去の問題 | 原因 | 対策 |
| --- | --- | --- |
| APIバージョン混在 | note.com API の進化 | Notion API は 2022-06-28 固定バージョン |
| エラー後のリトライなし | 実装漏れ | 指数バックオフリトライ実装 |
| 詳細なエラーログ不足 | catch後の即return | 構造化エラーログ |

---

## 3. アーキテクチャ設計

### 3.1 全体フロー
```
┌──────────────────────────────────────────────────────────────┐
│                          MCP Client                           │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                     src/tools/notion-tools.ts                 │
│  ┌─────────────────┐  ┌──────────────────┐  ┌───────────────┐ │
│  │ list-notion-     │  │ preview-notion-  │  │ import-       │ │
│  │ pages            │  │ to-note          │  │ notion-to-note│ │
│  └─────────────────┘  └──────────────────┘  └───────────────┘ │
└──────────────────────────────────────────────────────────────┘
                              │
            ┌─────────────────┼─────────────────┐
            ▼                 ▼                 ▼
┌───────────────────┐ ┌───────────────────┐ ┌───────────────────┐
│ notion-client.ts  │ │ notion-block-     │ │ notion-to-note-   │
│                   │ │ parser.ts         │ │ formatter.ts      │
│ - API認証           │ │ - Block→IR       │ │ - IR→Markdown     │
│ - ページ取得        │ │ - 再帰展開       │ │ - 画像参照整形     │
│ - ブロック取得      │ │ - リッチテキスト │ │ - Markdown出力    │
│ - 画像ダウンロード  │ └───────────────────┘ └───────────────────┘
│ - DBクエリ          │                 │
└───────────────────┘                 ▼
             │                 ┌───────────────────────────────┐
             ▼                 │ 既存note.comツール              │
┌───────────────────┐         │ - post-draft-note-with-images │
│ Notion API         │         │ - convertMarkdownToNoteHtml   │
└───────────────────┘         └───────────────────────────────┘
```

### 3.2 中間表現（IR）設計
Notion Block と note.com 形式の間に中間表現を設け、責務を分離する。

```ts
// src/types/notion-types.ts
interface NoteIRNode {
  type: NoteIRNodeType;
  content?: string;
  children?: NoteIRNode[];
  attributes?: {
    level?: number;
    language?: string;
    url?: string;
    caption?: string;
    checked?: boolean;
    icon?: string;
    hasColumnHeader?: boolean;
    hasRowHeader?: boolean;
  };
  richText?: RichTextSpan[];
}

type NoteIRNodeType =
  | 'heading'
  | 'paragraph'
  | 'bulletList'
  | 'numberedList'
  | 'todoList'
  | 'code'
  | 'quote'
  | 'callout'
  | 'divider'
  | 'image'
  | 'table'
  | 'tableRow'
  | 'tableCell'
  | 'embed'
  | 'bookmark'
  | 'unsupported';

interface RichTextSpan {
  text: string;
  annotations: {
    bold?: boolean;
    italic?: boolean;
    strikethrough?: boolean;
    underline?: boolean;
    code?: boolean;
  };
  href?: string;
}
```

---

## 4. ファイル構成

### 4.1 新規作成ファイル
```
src/
├── types/
│   └── notion-types.ts
│
├── config/
│   └── notion-config.ts
│
├── utils/
│   ├── notion-client.ts
│   ├── notion-block-parser.ts
│   └── notion-to-note-formatter.ts
│
└── tools/
    └── notion-tools.ts
```

### 4.2 既存ファイルの修正
```
src/
├── tools/
│   └── index.ts
│
├── config/
│   └── environment.ts
│
└── .env.sample
```

---

## 5. 詳細実装仕様

### 5.1 `notion-client.ts`
- Notion API のラッパーを提供。
- 既存の note.com API とは独立。

**必須メソッド**
- `getPage(pageId)`
- `getBlocks(blockId, recursive)`
- `downloadImage(url)`
- `queryDatabase(databaseId, params)` ← **list-notion-pages で必要**

**リトライ戦略**
- 401/403/404 → 即時終了
- 429 → Retry-After 待機
- その他 → 指数バックオフ（1s, 2s, 4s）

### 5.2 `notion-block-parser.ts`
- Notion Blocks を IR に変換する。
- ネストした子ブロックを再帰的に展開。
- リストの連続を `bulletList` / `numberedList` にグルーピング。
- `toggle` や `column_list` は子要素展開。
- 未対応は `unsupported` として警告ログ。

### 5.3 `notion-to-note-formatter.ts`
**重要: 直接HTML出力ではなく Markdown を出力する設計に変更**。

**理由**
- `convertMarkdownToNoteHtml()` は note.com 向けサニタイズと UUID 付与を行う。
- `post-draft-note-with-images` は Markdown 内画像参照を `<figure>` に差し替え済み。

**主な関数**
- `formatToMarkdown(nodes: NoteIRNode[]): string`
- `richTextToMarkdown(spans: RichTextSpan[]): string`
- `normalizeImageReferences()`

**画像の扱い**
- Notionの画像は Markdown 中で `![[filename]]` 形式に寄せる。
- `import-notion-to-note` で **Base64配列** として `post-draft-note-with-images` に渡す。

### 5.4 `notion-tools.ts`
**ツール定義（MCP）**
- `list-notion-pages`
- `get-notion-page`
- `preview-notion-to-note`
- `import-notion-to-note`

**設計ポイント**
- `import-notion-to-note` は内部で
  1. Notion APIからページ&ブロック取得
  2. IR変換
  3. Markdown変換
  4. 画像ダウンロード → Base64化
  5. `post-draft-note-with-images` 相当ロジックを **utilsとして再利用** するか、既存ツールを呼び出す

**注意**
- `postDraftNoteWithImages` はエクスポートされていないため、直接 import は不可。
- 共有ロジックは utils に切り出す前提とする。

---

## 6. 書式変換マッピング

### 6.1 ブロックタイプマッピング
| Notion Block | IR | Markdown | note.com HTML | 備考 |
| --- | --- | --- | --- | --- |
| paragraph | paragraph | 段落 | `<p>` | リッチテキスト対応 |
| heading_1 | heading(1) | `#` | `<h2>` | note.com 仕様 |
| heading_2 | heading(2) | `##` | `<h2>` | note.com 仕様 |
| heading_3 | heading(3) | `###` | `<h3>` | note.com 仕様 |
| bulleted_list_item | bulletList | `-` | `<ul><li>` | ネスト対応 |
| numbered_list_item | numberedList | `1.` | `<ol><li>` | ネスト対応 |
| to_do | todoList | `- [ ]` | `<p>` | チェック表現 |
| code | code | ``` | `<pre><code>` | 言語保持 |
| quote | quote | `>` | `<blockquote>` |  |
| callout | callout | `>` | `<blockquote>` | アイコンをテキスト化 |
| divider | divider | `---` | `<hr>` |  |
| image | image | `![[filename]]` | `<figure><img>` | 既存ロジックで置換 |
| table | table | Markdown表 | `<table>` | 既存変換が未対応なら警告 |
| bookmark | bookmark | `[title](url)` | `<a>` |  |
| embed | embed | `[url](url)` | `<a>` | `<iframe>` は使用しない |
| toggle | quote | `>` | `<blockquote>` | 展開表示 |

### 6.2 リッチテキストマッピング
| Notion Annotation | Markdown | 備考 |
| --- | --- | --- |
| bold | `**text**` |  |
| italic | `*text*` |  |
| strikethrough | `~~text~~` |  |
| underline | `_text_` | note.comで無視される可能性 |
| code | `` `text` `` |  |
| link | `[text](url)` |  |

### 6.3 非対応ブロックの処理
| Notion Block | 処理方法 | 警告 |
| --- | --- | --- |
| child_database | スキップ | 警告ログ |
| template | スキップ | 警告ログ |
| breadcrumb | スキップ |  |
| table_of_contents | スキップ |  |
| equation | テキスト化 |  |
| pdf/file/audio | リンク化 |  |

---

## 7. エラーハンドリング戦略

### 7.1 エラー分類
```ts
export enum NotionErrorCode {
  INVALID_TOKEN = 'INVALID_TOKEN',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  PAGE_NOT_FOUND = 'PAGE_NOT_FOUND',
  NO_ACCESS = 'NO_ACCESS',
  RATE_LIMITED = 'RATE_LIMITED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  SERVER_ERROR = 'SERVER_ERROR',
  UNSUPPORTED_BLOCK = 'UNSUPPORTED_BLOCK',
  IMAGE_DOWNLOAD_FAILED = 'IMAGE_DOWNLOAD_FAILED',
  IMAGE_UPLOAD_FAILED = 'IMAGE_UPLOAD_FAILED',
}
```

### 7.2 リトライ戦略
- 401/403/404 → 即時終了
- 429 → Retry-After 待機
- 5xx/Network → 指数バックオフ（最大3回）

### 7.3 部分成功の処理
```ts
interface ImportResult {
  success: boolean;
  note_id?: string;
  stats: {
    total_blocks: number;
    converted_blocks: number;
    skipped_blocks: number;
    images_total: number;
    images_success: number;
    images_failed: number;
  };
  warnings: string[];
  error?: string;
}
```

---

## 8. テスト計画

### 8.1 ユニットテスト
| テスト対象 | テストケース | 優先度 |
| --- | --- | --- |
| notion-block-parser.ts | 各ブロックタイプの変換 | 高 |
| notion-block-parser.ts | リッチテキストのアノテーション | 高 |
| notion-block-parser.ts | ネストリスト | 中 |
| notion-to-note-formatter.ts | IR→Markdown変換 | 高 |
| notion-to-note-formatter.ts | 画像参照の正規化 | 高 |
| notion-client.ts | リトライロジック | 中 |

### 8.2 統合テスト
| シナリオ | 検証項目 |
| --- | --- |
| シンプル記事 | 見出し・段落・リスト変換 |
| 画像付き記事 | Notion画像→note.com再アップロード |
| 複雑構造 | ネスト・テーブル・コード |
| エラーケース | 無効Token・アクセス権なし |

### 8.3 テスト用Notionページ
- H1/H2/H3
- 段落（太字、斜体、リンク）
- 箇条書き/番号付きリスト
- チェックボックス
- コードブロック
- 引用・コールアウト
- 区切り線
- テーブル
- 画像（Notion内/外部URL）
- YouTube/ブックマーク
- 非対応ブロック（子ページ/DB）

---

## 9. 実装フェーズ

### Phase 1: 基盤構築（2日）
- `types/notion-types.ts` 作成
- `config/notion-config.ts` 作成
- `utils/notion-client.ts` 作成
- `.env.sample` + `environment.ts` に `NOTION_TOKEN` 追加

### Phase 2: 変換エンジン（3日）
- `notion-block-parser.ts` 実装
- `notion-to-note-formatter.ts` 実装（Markdown出力）

### Phase 3: MCPツール実装（2日）
- `tools/notion-tools.ts` 実装
- `tools/index.ts` に登録追加

### Phase 4: 画像処理と統合（2日）
- Notion画像ダウンロード
- `post-draft-note-with-images` ロジック再利用
- E2Eテスト

---

## 10. リスクと緩和策

### 10.1 技術的リスク
| リスク | 確率 | 影響 | 緩和策 |
| --- | --- | --- | --- |
| Notion API変更 | 低 | 中 | APIバージョン固定 |
| 画像URL期限切れ | 中 | 高 | 即時再アップロード |
| 複雑ブロック構造 | 中 | 中 | 未対応は警告+スキップ |
| Rate Limiting | 中 | 低 | Retry-After 対応 |
| note.com API変更 | 低 | 高 | 既存コード監視 |

### 10.2 運用リスク
| リスク | 確率 | 影響 | 緩和策 |
| --- | --- | --- | --- |
| Token管理ミス | 中 | 高 | 明確なエラーメッセージ |
| Integration未接続 | 高 | 中 | 403時に手順提示 |
| 大量ブロック | 低 | 中 | ページネーション |

---

## 11. 付録: 依存パッケージ
```json
{
  "dependencies": {
    "@notionhq/client": "^2.2.14"
  }
}
```
