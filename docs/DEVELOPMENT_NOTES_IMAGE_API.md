# note MCP 開発手記: API経由での画像挿入の実現

## 📅 開発期間

- **調査開始**: 2024年12月18日
- **Playwright実装**: 2024年12月19日
- **API経由実装成功**: 2024年12月22日

---

## 🎯 目的

ObsidianでMarkdown編集した記事をnote.comに投稿する際、**ローカル画像を本文中に自動挿入する**機能を実現する。

### 要件

1. ✅ ローカル画像（`![[image.png]]`形式）を検出
2. ✅ note.comにアップロード
3. ✅ 本文中の適切な位置に画像を挿入
4. ✅ **安定した動作**（Playwrightの不安定さを回避）

---

## 🔍 調査フェーズ（Dec 18-19）

### 1. noteの画像アップロードAPI

noteは**2段階のプロセス**で画像をアップロードします：

#### Step 1: Presigned URLの取得

```http
POST https://note.com/api/v3/images/upload/presigned_post
Content-Type: multipart/form-data

filename=test-image.png
```

**レスポンス:**
```json
{
  "data": {
    "url": "https://assets.st-note.com/img/1766388926-xxx.png",
    "action": "https://assets.st-note.com",
    "post": {
      "key": "img/1766388926-xxx.png",
      "policy": "...",
      "x-amz-credential": "...",
      "x-amz-algorithm": "AWS4-HMAC-SHA256",
      "x-amz-date": "...",
      "x-amz-signature": "..."
    }
  }
}
```

#### Step 2: S3への直接アップロード

```http
POST https://assets.st-note.com
Content-Type: multipart/form-data

key=img/1766388926-xxx.png
policy=...
x-amz-credential=...
x-amz-algorithm=AWS4-HMAC-SHA256
x-amz-date=...
x-amz-signature=...
file=<binary data>
```

**結果:** `https://assets.st-note.com/img/1766388926-xxx.png` が取得できる

---

### 2. 本文への画像挿入の課題

#### ❌ 失敗した方法（Dec 18-19）

**試行1: Markdown形式で送信**
```markdown
![テスト画像](https://assets.st-note.com/img/xxx.png)
```
**結果:** テキストとしてそのまま保存される（画像として表示されない）

**試行2: HTML `<img>`タグで送信**
```html
<p>テキスト前</p>
<img src="https://assets.st-note.com/img/xxx.png" alt="test">
<p>テキスト後</p>
```
**結果:** `<img>`タグが**サニタイズされて削除される**

**試行3: 外部URL（GitHub Raw）**
```html
<img src="https://raw.githubusercontent.com/.../image.png">
```
**結果:** 同様にサニタイズされる

#### 🤔 サニタイズの原因（当初の仮説）

当初は「**noteのAPIは本文中の`<img>`タグを一切受け付けない**」と結論づけていました。

この仮説により、**Playwright経由でのエディタ操作**が唯一の解決策と考えられていました。

---

### 3. Playwright実装（Dec 19）

API経由での画像挿入が不可能と判断し、Playwrightでnoteエディタを直接操作する方法を実装：

```javascript
// 「+」ボタンをクリック
// → 「画像」メニューを選択
// → ファイルチューザーで画像を選択
// → トリミングダイアログで保存
```

#### ✅ 成功したが...

- 画像挿入は成功
- **しかし不安定**：
  - UIの位置が変わると失敗
  - トリミングダイアログの表示タイミングが不安定
  - 複数画像の連続挿入でエラー
  - 実行時間が長い（1画像あたり5-10秒）

---

## 💡 ブレークスルー（Dec 22）

### 再調査：サニタイズの真の原因

「本当にすべての`<img>`タグがサニタイズされるのか？」という疑問から、**既存の記事の本文形式を詳細に分析**しました。

#### 🔍 既存記事の分析

```bash
node scripts/analyze-note-body.mjs n7cb162686d17
```

**発見:**
```html
<figure name="uuid" id="uuid">
  <img src="https://assets.st-note.com/img/1763370763-xxx.png" 
       alt="" width="620" height="469">
  <figcaption>キャプション</figcaption>
</figure>
```

noteは画像を`<figure>`タグで囲んだ`<img>`タグとして保存していました！

---

### 🧪 検証実験

様々な形式でAPIに送信してサニタイズをテスト：

```javascript
// Test 1: シンプルな<img>タグ
body: '<p>テスト前</p><img src="https://assets.st-note.com/img/xxx.png"><p>テスト後</p>'
// 結果: ✅ 残っている

// Test 2: <figure>で囲んだ<img>タグ
body: '<p>テスト前</p><figure name="uuid" id="uuid"><img src="https://assets.st-note.com/img/xxx.png" width="620" height="469"></figure><p>テスト後</p>'
// 結果: ✅ 残っている

// Test 3: <figure>+<figcaption>
body: '<p>テスト前</p><figure name="uuid" id="uuid"><img src="https://assets.st-note.com/img/xxx.png" width="620" height="469"><figcaption>キャプション</figcaption></figure><p>テスト後</p>'
// 結果: ✅ 残っている
```

### 🎉 重大な発見

**画像URLが `https://assets.st-note.com/` で始まる場合、サニタイズされない！**

つまり：
- ❌ 外部URL（GitHub、他サイト）→ サニタイズされる
- ❌ ローカルパス → サニタイズされる
- ✅ **note.comのS3 URL** → **サニタイズされない！**

---

## 🚀 API経由での画像挿入実装

### アーキテクチャ

```
┌─────────────────────────────────────────────────────────┐
│  Obsidian Markdown                                       │
│  ![[image.png|キャプション]]                             │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Step 1: 画像をBase64で受信                              │
│  { fileName: "image.png", base64: "iVBORw0KGgo..." }    │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Step 2: note.comのS3にアップロード                      │
│  POST /api/v3/images/upload/presigned_post              │
│  → S3 URL取得: https://assets.st-note.com/img/xxx.png  │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Step 3: <figure><img>タグを生成                        │
│  <figure name="uuid" id="uuid">                         │
│    <img src="https://assets.st-note.com/img/xxx.png"   │
│         width="620" height="auto">                      │
│    <figcaption>キャプション</figcaption>                │
│  </figure>                                              │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Step 4: API経由で下書き保存                             │
│  POST /api/v1/text_notes/draft_save                     │
│  → サニタイズされずに保存される！                        │
└─────────────────────────────────────────────────────────┘
```

### 実装コード

#### MCPツール: `post-draft-note-with-images`

```typescript
server.tool(
  "post-draft-note-with-images",
  "画像付きの下書き記事を作成する（Playwrightなし、API経由で画像を本文に挿入）",
  {
    title: z.string(),
    body: z.string(), // Markdown形式
    images: z.array(z.object({
      fileName: z.string(),
      base64: z.string(),
      mimeType: z.string().optional()
    })).optional(),
    tags: z.array(z.string()).optional(),
  },
  async ({ title, body, images, tags }) => {
    // 1. 画像をアップロード
    const uploadedImages = new Map<string, string>();
    for (const img of images) {
      const imageUrl = await uploadImageToNoteS3(img);
      uploadedImages.set(img.fileName, imageUrl);
    }

    // 2. Markdown内の画像参照を<figure><img>タグに置換
    let processedBody = body.replace(
      /!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
      (match, fileName, caption) => {
        const imageUrl = uploadedImages.get(fileName);
        if (imageUrl) {
          return `<figure name="${uuid()}" id="${uuid()}">
            <img src="${imageUrl}" width="620" height="auto">
            <figcaption>${caption || ''}</figcaption>
          </figure>`;
        }
        return match;
      }
    );

    // 3. API経由で下書き保存
    await noteApiRequest('/v1/text_notes/draft_save', 'POST', {
      body: processedBody,
      name: title,
      // ...
    });
  }
);
```

---

## 📊 比較：Playwright vs API

| 項目             | Playwright                     | API経由              |
| ---------------- | ------------------------------ | -------------------- |
| **安定性**       | ❌ 不安定（UI変更で壊れる）     | ✅ 安定               |
| **速度**         | ❌ 遅い（1画像5-10秒）          | ✅ 高速（1画像1-2秒） |
| **複数画像**     | ❌ エラーが発生しやすい         | ✅ 安定して処理       |
| **依存関係**     | ❌ Playwright必須               | ✅ 標準APIのみ        |
| **メンテナンス** | ❌ noteのUI変更で修正必要       | ✅ API仕様が安定      |
| **実装複雑度**   | ❌ 高い（セレクタ、タイミング） | ✅ シンプル           |

---

## 🎓 学んだこと

### 1. サニタイズの真の原因

**誤解:** 「noteのAPIは本文中の`<img>`タグを一切受け付けない」

**真実:** 「**外部URLやローカルパスはサニタイズされるが、note.comのS3 URLは保持される**」

これは**セキュリティ対策**です：
- 外部URLからの画像読み込みを防ぐ（XSS対策、プライバシー保護）
- note.com管理下の画像のみ許可

### 2. 既存データの分析の重要性

「どうやって保存されているか」を分析することで、正しいアプローチが見えました。

### 3. 仮説の再検証

一度「不可能」と結論づけても、別の角度から再検証することで解決策が見つかることがあります。

---

## 📝 実装ファイル

### 新規追加

- `src/tools/note-tools.ts` - `post-draft-note-with-images` ツール追加
- `scripts/analyze-note-body.mjs` - 既存記事の本文形式を分析
- `scripts/test-image-body-api.mjs` - サニタイズ検証実験
- `scripts/test-full-image-flow.mjs` - 完全な画像挿入フロー

### 既存実装（Playwright版）

- `src/tools/publish-tools.ts` - `publish-from-obsidian` ツール
- `src/tools/image-tools.ts` - `upload-image` ツール

---

## 🚀 今後の展開

### 短期

1. ✅ MCPツールとして統合完了
2. ⏳ HTTPサーバーにも統合
3. ⏳ Obsidianプラグインから利用可能に

### 長期

1. アイキャッチ画像の自動設定
2. 画像の最適化（リサイズ、圧縮）
3. 画像キャプションの自動生成（AI活用）

---

## 📚 参考資料

- [IMAGE_UPLOAD_RESEARCH.md](./IMAGE_UPLOAD_RESEARCH.md) - 初期調査レポート
- [playwright-image-insert-analysis.md](./playwright-image-insert-analysis.md) - Playwright実装の分析

---

**最終更新:** 2024年12月22日
**作成者:** しまゆず with Cascade AI
