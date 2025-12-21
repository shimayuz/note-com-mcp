# note MCP 画像アップロード機能 調査レポート

## 概要

ローカルPC（Obsidian等）の画像をnote.comの記事本文中に挿入する機能の実装に向けた調査結果をまとめます。

## 目的

- ObsidianでMarkdown編集した記事をnoteに投稿する際、ローカル画像をそのまま使用できるようにする
- MCP経由でMarkdown→HTML変換時に画像を自動的に差し込む

## noteの記事構造

```
┌─────────────────────────────┐
│  アイキャッチ画像（サムネイル）  │  ← eyecatchUrl で管理
├─────────────────────────────┤
│  タイトル                      │
├─────────────────────────────┤
│  本文                         │
│  ├─ テキスト                  │
│  ├─ 画像（本文中）             │  ← 別形式で管理（後述）
│  ├─ テキスト                  │
│  └─ ...                      │
└─────────────────────────────┘
```

## 調査結果

### 1. 画像アップロードの仕組み

noteの画像アップロードは**2段階のプロセス**で行われます：

#### Step 1: Presigned URL の取得
```
POST https://note.com/api/v3/images/upload/presigned_post
```

**リクエスト例:**
```json
{
  "content_type": "image/png",
  "file_name": "test-image.png"
}
```

**レスポンス例:**
```json
{
  "data": {
    "url": "https://assets.st-note.com/img/1766064529-xxxxx.png",
    "fields": {
      "key": "img/1766064529-xxxxx.png",
      "policy": "...",
      "x-amz-credential": "...",
      "x-amz-algorithm": "AWS4-HMAC-SHA256",
      "x-amz-date": "...",
      "x-amz-signature": "..."
    },
    "presigned_url": "https://assets.st-note.com"
  }
}
```

#### Step 2: S3への直接アップロード
```
POST https://assets.st-note.com
Content-Type: multipart/form-data
```

Presigned URLで取得した`fields`と画像ファイルを`multipart/form-data`で送信。

### 2. 認証に必要なCookie/ヘッダー

| 項目                                | 説明             |
| ----------------------------------- | ---------------- |
| `_note_session_v5`                  | セッションCookie |
| `XSRF-TOKEN`                        | CSRFトークン     |
| `X-Requested-With: XMLHttpRequest`  | 必須ヘッダー     |
| `Referer: https://editor.note.com/` | 必須ヘッダー     |

### 3. アイキャッチ画像 vs 本文中の画像

| 項目     | アイキャッチ画像                                           | 本文中の画像                |
| -------- | ---------------------------------------------------------- | --------------------------- |
| API管理  | `eyecatchUrl`フィールド                                    | 別形式（ProseMirror JSON?） |
| 挿入方法 | Playwrightで成功                                           | API経由では困難             |
| URL形式  | `https://assets.st-note.com/production/uploads/images/...` | 同様                        |

### 4. 本文への画像挿入の課題

#### 試行1: Markdown形式
```markdown
![テスト画像](https://assets.st-note.com/img/xxx.png)
```
**結果:** テキストとしてそのまま保存される（画像として表示されない）

#### 試行2: HTML形式
```html
<img src="https://assets.st-note.com/img/xxx.png" alt="テスト画像">
```
**結果:** `<img>`タグがサニタイズされて削除される

#### 試行3: Playwrightでエディタ操作
- 「+」ボタンのクリック → 位置特定が困難
- 画像メニューの選択 → UIが動的で不安定
- トリミングモーダルの操作 → 成功/失敗が不安定

### 5. noteエディタの技術スタック

- **エディタ:** ProseMirror ベース
- **フォーマット:** `format: "3.0"` または `format: "4.0"`
- **本文HTML:** `<p name="uuid" id="uuid" class="paragraph">...</p>` 形式

## 成功した機能

### ✅ ローカル画像のアップロード

```javascript
// test-upload-with-login.mjs で実装済み
// 1. ログイン
// 2. Presigned URL取得
// 3. S3へアップロード
// 4. 画像URL取得
```

**取得できるURL例:**
```
https://assets.st-note.com/img/1766064529-pkdKFDRoeOsSrnzANjvCJa8l.png
```

### ✅ アイキャッチ画像の設定

Playwrightでエディタを操作し、アイキャッチ画像として設定することに成功。

### ✅ テキストのみの記事作成

```javascript
// MCP経由で下書き作成
mcp6_post-draft-note({
  title: "タイトル",
  body: "本文テキスト",
  tags: ["タグ1", "タグ2"]
})
```

## 未解決の課題

### ❌ 本文中への画像挿入（API経由）

noteのAPIは本文中の画像を特定の形式（おそらくProseMirror JSON）で管理しており、単純なMarkdownやHTMLタグでは挿入できない。

### ❌ Playwrightでの安定した画像挿入

エディタUIの操作が複雑で、安定した自動化が困難。

## 作成したテストスクリプト

| ファイル                      | 目的                               |
| ----------------------------- | ---------------------------------- |
| `test-full-upload.mjs`        | 完全な画像アップロード＆挿入フロー |
| `test-upload-with-login.mjs`  | ログイン＆画像アップロード         |
| `verify-image-in-body.mjs`    | 本文中の画像表示確認               |
| `capture-body-image-html.mjs` | 本文中画像のHTML形式キャプチャ     |
| `inspect-editor-state.mjs`    | エディタ内部状態の確認             |
| `trace-image-upload.mjs`      | APIリクエストのトレース            |

## 今後の方針案

### 案1: 画像URLのみ取得し、手動で挿入
1. ローカル画像をnoteにアップロードしてURLを取得（自動）
2. 本文はテキストのみでAPI経由で保存（自動）
3. 画像の挿入はnoteエディタで手動で行う

### 案2: 画像URLをプレースホルダーとして保存
1. 本文中に画像URLをテキストとして埋め込む
2. 後でnoteエディタで画像に置き換える

### 案3: ProseMirror形式の解析
1. noteエディタの内部形式を詳細に解析
2. 正しいJSON形式で本文を構築
3. API経由で保存

## 環境変数

```env
NOTE_EMAIL=your-email@example.com
NOTE_PASSWORD=your-password
NOTE_SESSION_V5=session-cookie-value
NOTE_XSRF_TOKEN=xsrf-token-value
```

## 参考情報

- noteエディタURL: `https://editor.note.com/notes/{noteId}/edit/`
- 画像アセットURL: `https://assets.st-note.com/`
- API Base URL: `https://note.com/api/`

---

## 追加検証結果（2025-12-19 08:00）

### 外部画像URLのテスト

```javascript
// テスト: GitHub Raw URLを本文に挿入
mcp6_post-draft-note({
  title: "外部画像URLテスト",
  body: "<p>テキスト前</p><p><img src=\"https://raw.githubusercontent.com/...\" alt=\"test\"></p><p>テキスト後</p>"
})
```

**結果:** `<img>`タグがサニタイズされ、`テキスト前テキスト後`のみが保存された。

### 結論

| 方法                   | 結果                   |
| ---------------------- | ---------------------- |
| Markdown `![alt](url)` | ❌ テキストとして保存   |
| HTML `<img src="...">` | ❌ サニタイズされて削除 |
| 外部URL（GitHub Raw）  | ❌ 同様にサニタイズ     |
| noteのS3 URL           | ❌ 同様にサニタイズ     |

**noteのAPIは本文中の`<img>`タグを一切受け付けない。**

---

## 最終的な解決策

### 推奨: Playwright自動化（ハイブリッドアプローチ）

```
┌─────────────────────────────────────────────────────────────┐
│                 Obsidian → note 投稿フロー                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Step 1: 画像をGitHubにpush（バージョン管理）               │
│          └─ images/xxx.png                                  │
│                                                             │
│  Step 2: MCP経由で下書き作成（テキストのみ）                │
│          └─ 画像位置にプレースホルダー: [IMAGE:xxx.png]     │
│                                                             │
│  Step 3: Playwrightで画像挿入                               │
│          └─ プレースホルダーを検出 → 画像を挿入             │
│                                                             │
│  Step 4: 下書き保存                                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 実装タスク

1. **GitHub連携**
   - 画像をGitHubリポジトリにpush
   - GitHub Actionsで自動同期

2. **Markdown変換ツール**
   - Obsidian Markdown → note HTML
   - 画像パスをプレースホルダーに変換

3. **Playwright画像挿入スクリプト**
   - プレースホルダーを検出
   - 対応する画像をローカル/GitHubから取得
   - noteエディタに挿入

4. **MCPツール統合**
   - `publish-from-obsidian` ツールを新規作成
   - 上記フローを一括実行

---

## 環境構成案

```
/obsidian-vault/
├── articles/
│   └── 2025-01-01-title.md
└── images/
    └── screenshot.png

/github-repo/
├── articles/
│   └── 2025-01-01-title.md
└── images/
    └── screenshot.png  ← Obsidianと同期

/note-mcp/
├── src/
│   └── tools/
│       ├── image-tools.ts      ← 画像アップロード
│       ├── note-tools.ts       ← 記事操作
│       └── obsidian-tools.ts   ← 新規：Obsidian連携
└── scripts/
    └── playwright-image-insert.mjs  ← 画像挿入自動化
```

---

**最終更新:** 2025-12-19
