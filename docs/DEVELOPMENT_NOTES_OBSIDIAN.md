# note publisher 開発手記 Vol.2: Obsidian連携編

## 概要

本稿は [note publisher 開発手記](./DEVELOPMENT_NOTES.md) の続編です。
Obsidian からの記事投稿機能の実装について記録します。

---

## なぜ Obsidian 連携が必要か

### 背景

多くのライターは Obsidian で記事を執筆しています。理由は：

- Markdown でシンプルに書ける
- ローカルファイルなのでオフラインでも編集可能
- バックリンクやグラフビューで知識を整理できる
- 画像もローカルに保存できる

しかし、Obsidian から note.com への投稿は手間がかかります：

1. Markdown をコピー
2. note.com のエディタに貼り付け
3. 書式が崩れるので手動で修正
4. 画像を一つずつアップロード
5. 画像の位置を調整

この作業を自動化することが目標です。

---

## 技術的チャレンジ

### 1. Markdown → note.com HTML 変換

note.com のエディタは独自の HTML 形式を使用しています。

**note.com の見出しルール**:
```
Markdown    → note.com
# H1        → <h2>大見出し</h2>
## H2       → <h3>小見出し</h3>
### H3以降  → <strong>強調</strong>
```

**UUID 属性の必要性**:
```html
<!-- note.com のHTML形式 -->
<h2 name="a1b2c3d4-..." id="a1b2c3d4-...">見出し</h2>
<p name="e5f6g7h8-..." id="e5f6g7h8-...">本文</p>
```

すべての要素に UUID が必要です。

**実装（markdown-converter.ts）**:
```typescript
function generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function addUUIDAttributes(html: string): string {
    return html.replace(/<(\w+)([^>]*)>/g, (match, tag, attrs) => {
        if (tag === 'hr' || tag === 'br') return match;
        const uuid = generateUUID();
        return `<${tag}${attrs} name="${uuid}" id="${uuid}">`;
    });
}
```

### 2. Obsidian 特有の記法への対応

Obsidian には標準 Markdown にない記法があります。

**対応した記法**:

| 記法 | 説明 | 変換結果 |
|------|------|----------|
| `![[image.png]]` | 画像埋め込み | 画像挿入 |
| `![[image.png\|300]]` | サイズ指定画像 | 画像挿入 |
| `[[link]]` | 内部リンク | テキストとして表示 |
| `[[link\|表示名]]` | 表示名付きリンク | 表示名として表示 |
| `==ハイライト==` | ハイライト | `<strong>` |

**実装（markdown-converter.ts）**:
```typescript
function processInline(text: string): string {
    let result = text;

    // Obsidianハイライト → 太字
    result = result.replace(/==(.+?)==/g, '<strong>$1</strong>');

    // Obsidian内部リンク
    result = result.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2');
    result = result.replace(/\[\[([^\]]+)\]\]/g, '$1');

    return result;
}
```

### 3. 画像の自動挿入

最大の難関は画像の挿入でした。

**API経由では不可能だった理由**:
- note.com の API は画像アップロード後に返される URL を本文に挿入する必要がある
- しかし、エディタの内部状態と API 経由で作成した HTML が一致しない
- 結果として画像が正しく表示されない

**解決策: Playwright による UI 自動操作**

実際のブラウザを自動操作して、人間と同じ手順で画像を挿入します。

```typescript
async function insertImageAtCurrentPosition(
    page: Page,
    bodyBox: any,
    imagePath: string
): Promise<void> {
    // 新しいパラグラフを作成
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');

    // 「+」ボタンをクリック
    const allBtns = await page.$$('button');
    for (const btn of allBtns) {
        const box = await btn.boundingBox();
        if (box && box.x < bodyBoxHandle.x && box.width < 60) {
            await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
            break;
        }
    }

    // 「画像」メニューをクリック
    const imageMenuItem = page.locator('[role="menuitem"]:has-text("画像")').first();

    // ファイルチューザーを待機しながらクリック
    const [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        imageMenuItem.click(),
    ]);

    // 画像ファイルを設定
    await chooser.setFiles(imagePath);

    // トリミングダイアログがあれば保存
    const dialog = page.locator('div[role="dialog"]');
    const saveBtn = dialog.locator('button:has-text("保存")');
    await saveBtn.click();
}
```

### 4. 書式の再現（UI操作アプローチ）

API 経由で HTML を送信すると書式が崩れる問題がありました。

**問題**:
- `<h2>` を送信しても通常のテキストになる
- `<blockquote>` が認識されない
- リストの入れ子構造が崩れる

**解決策**: エディタの UI を直接操作

```typescript
export async function formatToNoteEditor(
    page: Page,
    elements: MarkdownElement[],
    imageBasePath: string,
    insertImageFn: Function
): Promise<void> {
    const bodyBox = page.locator('div[contenteditable="true"][role="textbox"]').first();

    for (const element of elements) {
        switch (element.type) {
            case 'heading2':
                await clickPlusButton(page);
                await page.locator('[role="menuitem"]:has-text("大見出し")').click();
                await page.keyboard.type(element.content);
                break;

            case 'bulletList':
                await clickPlusButton(page);
                await page.locator('[role="menuitem"]:has-text("箇条書きリスト")').click();
                for (const item of element.content.split('\n')) {
                    await page.keyboard.type(item);
                    await page.keyboard.press('Enter');
                }
                break;

            case 'quote':
                await clickPlusButton(page);
                await page.locator('[role="menuitem"]:has-text("引用")').click();
                await page.keyboard.type(element.content);
                break;

            // ... 他の要素タイプ
        }
    }
}
```

### 5. アイキャッチ画像の設定

最初の画像をアイキャッチとして設定する機能も実装しました。

```typescript
async function setEyecatchImage(page: Page, imagePath: string): Promise<void> {
    // 複数のセレクター候補を試行
    const selectors = [
        'button[aria-label="画像を追加"]',
        'button:has-text("画像を追加")',
        '[role="button"][aria-label*="アイキャッチ"]',
        // ... その他のセレクター
    ];

    for (const selector of selectors) {
        const btn = page.locator(selector).first();
        try {
            await btn.waitFor({ state: 'visible', timeout: 3000 });
            await btn.click();
            // 成功したらループを抜ける
            break;
        } catch (e) {
            continue;
        }
    }

    // ファイルチューザーでファイルを設定
    // トリミングダイアログを処理
}
```

---

## 実装したツール

### 1. convert-obsidian-markdown

Obsidian Markdown を note.com HTML に変換します。

```typescript
{
    markdownPath: "記事.md",        // または
    markdownContent: "# タイトル\n...",
    imageBasePath: "/path/to/images"
}
```

**出力**:
```json
{
    "success": true,
    "title": "記事タイトル",
    "html": "<h2>...</h2><p>...</p>",
    "images": [
        { "fileName": "image.png", "exists": true }
    ]
}
```

### 2. prepare-obsidian-draft

下書き投稿用にデータを準備します。

```typescript
{
    markdownPath: "記事.md",
    imageBasePath: "/path/to/images",
    tags: ["タグ1", "タグ2"]
}
```

### 3. publish-from-obsidian

Playwright で完全自動投稿します。

```typescript
{
    markdownPath: "記事.md",
    imageBasePath: "/path/to/images",
    tags: ["タグ1"],
    headless: false,      // ブラウザを表示
    saveAsDraft: true     // 下書きとして保存
}
```

**処理フロー**:
1. Markdown を解析
2. ログインページでログイン
3. 新規記事エディタを開く
4. タイトルを入力
5. 最初の画像をアイキャッチに設定
6. 本文を UI 操作で入力（書式付き）
7. 画像を順番に挿入
8. 下書き保存

### 4. insert-images-to-note

既存の下書きに画像を追加します。

```typescript
{
    noteId: "n123456",    // または
    editUrl: "https://editor.note.com/notes/n123456/edit/",
    imagePaths: ["/path/to/image1.png", "/path/to/image2.png"],
    headless: false
}
```

### 5. publish-from-obsidian-remote

リモートサーバー用。画像を Base64 で受け取ります。

```typescript
{
    title: "記事タイトル",
    markdown: "## 見出し\n...",
    images: [
        { fileName: "image.png", base64: "iVBORw0KGgo...", mimeType: "image/png" }
    ],
    headless: true,
    saveAsDraft: true
}
```

---

## 苦労したポイント

### 1. 「+」ボタンの位置検出

note.com のエディタは「+」ボタンの位置が動的に変わります。

```typescript
async function clickPlusButton(page: Page): Promise<void> {
    const bodyBox = page.locator('div[contenteditable="true"]').first();
    const bodyBoxHandle = await bodyBox.boundingBox();

    // 本文エリアの左側にあるボタンを探す
    const allBtns = await page.$$('button');
    for (const btn of allBtns) {
        const box = await btn.boundingBox();
        if (box.x > bodyBoxHandle.x - 100 &&
            box.x < bodyBoxHandle.x &&
            box.width < 60) {
            // これが「+」ボタン
            await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
            return;
        }
    }

    // フォールバック: 推定位置をクリック
    await page.mouse.click(bodyBoxHandle.x - 30, bodyBoxHandle.y + 50);
}
```

### 2. トリミングダイアログの処理

画像アップロード後にトリミングダイアログが表示される場合があります。

```typescript
// ダイアログが表示されるか確認（タイムアウト付き）
const dialog = page.locator('div[role="dialog"]');
try {
    await dialog.waitFor({ state: 'visible', timeout: 5000 });
    const saveBtn = dialog.locator('button:has-text("保存")').first();
    await saveBtn.click();
    await dialog.waitFor({ state: 'hidden', timeout: 10000 });
} catch (e) {
    // ダイアログなし、続行
}
```

### 3. Frontmatter の処理

Obsidian の Frontmatter を除去する必要があります。

```typescript
export function removeFrontmatter(markdown: string): string {
    return markdown.replace(/^---\n[\s\S]*?\n---\n?/, '');
}
```

### 4. 画像パスの解決

Obsidian は相対パスで画像を参照することが多いです。

```typescript
const fullPath = element.imagePath.startsWith('/')
    ? element.imagePath
    : path.join(imageBasePath, element.imagePath);
```

---

## 学んだ教訓

### 1. API より UI 操作が確実な場合がある

note.com のエディタは高度なリッチテキストエディタです。
API で HTML を送っても、エディタの内部状態と一致しないことがあります。

UI 操作なら、エディタが期待する形式で確実にデータが作成されます。

### 2. セレクターは複数候補を用意する

note.com の UI は頻繁に更新されます。
セレクターが変わっても動作するよう、複数の候補を用意しました。

```typescript
const selectors = [
    'button[aria-label="画像を追加"]',
    'button:has-text("画像を追加")',
    '[role="button"][aria-label*="アイキャッチ"]',
    // フォールバック候補
];

for (const selector of selectors) {
    try {
        await page.locator(selector).click();
        break;
    } catch {
        continue;
    }
}
```

### 3. 待機時間は重要

UI 操作では、各アクション後に適切な待機が必要です。

```typescript
await page.waitForTimeout(500);  // アニメーション完了を待つ
await page.waitForTimeout(3000); // 画像アップロード完了を待つ
```

### 4. ヘッドレスモードのデバッグ

開発中は `headless: false` でブラウザを表示してデバッグすると効率的です。

---

## 今後の展望

### 計画中の機能

- [ ] Obsidian プラグインの開発
- [ ] 画像の自動最適化（サイズ調整、圧縮）
- [ ] テーブル記法の対応
- [ ] 数式（LaTeX）の対応
- [ ] 埋め込みコンテンツ（YouTube、Twitter）の対応

### 技術的改善

- [ ] 処理速度の最適化
- [ ] エラーリカバリーの強化
- [ ] 複数記事の一括投稿

---

## 使用例

### ローカルから投稿

```bash
# MCP サーバー起動
npm run start:http

# Claude Desktop から
「/path/to/記事.md を note に下書き投稿して」
```

### リモートから投稿（n8n など）

```json
{
    "name": "publish-from-obsidian-remote",
    "arguments": {
        "title": "記事タイトル",
        "markdown": "## 見出し\n本文...",
        "images": [
            {
                "fileName": "image.png",
                "base64": "iVBORw0KGgo...",
                "mimeType": "image/png"
            }
        ],
        "saveAsDraft": true
    }
}
```

---

**文書作成日**: 2025年12月21日
**前編**: [note publisher 開発手記](./DEVELOPMENT_NOTES.md)
