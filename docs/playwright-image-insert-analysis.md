# note.com 本文画像挿入 - Playwright自動化の分析レポート

## 概要

note.comエディタで本文中に画像を自動挿入するPlaywrightスクリプトの開発において、多くの試行錯誤を経て最終的に成功した。本ドキュメントでは、失敗の原因と成功の要因を詳細に分析し、今後の参考とする。

---

## 試行した方法と失敗の原因

### 1. クリップボードペースト方式

**試行内容**:
```javascript
// 画像をクリップボードにコピーしてペースト
await page.keyboard.press('Control+V');
```

**失敗の原因**:
- Playwrightでは画像データをクリップボードに設定することが困難
- ブラウザのセキュリティ制限によりクリップボードAPIへのアクセスが制限される
- noteエディタがクリップボードからの画像ペーストを期待する形式と異なる

---

### 2. ドラッグ&ドロップ方式

**試行内容**:
```javascript
// DataTransferを使用してドロップイベントを発火
const dataTransfer = new DataTransfer();
dataTransfer.items.add(file);
editor.dispatchEvent(new DragEvent('drop', { dataTransfer }));
```

**失敗の原因**:
- noteエディタはProseMirrorベースで、標準的なDOM操作やイベントでは画像を挿入できない
- エディタ内部の状態管理がカスタム実装されており、外部からのイベント発火では正しく処理されない

---

### 3. input[type="file"]直接操作方式

**試行内容**:
```javascript
// 隠れたファイル入力要素を直接操作
const fileInput = await page.$('input[type="file"]');
await fileInput.setInputFiles(imagePath);
```

**失敗の原因**:
- noteエディタでは`input[type="file"]`が動的に生成される
- ファイル入力要素がDOMに存在しないタイミングで操作しようとした
- 本文エリアの画像挿入では、この方式が使用されていない

---

### 4. 座標ベースクリック方式（初期）

**試行内容**:
```javascript
// 固定座標で「+」ボタンをクリック
await page.mouse.click(365, 337);
```

**失敗の原因**:
- 画面サイズやスクロール位置によって座標がずれる
- 「+」ボタンはホバー時のみ表示されるため、座標が正確でもクリックできない
- 間違った要素（AIアシスタントボタンなど）をクリックしてしまう

---

### 5. aria-label属性による特定方式

**試行内容**:
```javascript
// aria-labelで「画像を追加」ボタンを特定
const btn = await page.$('button[aria-label="画像を追加"]');
```

**失敗の原因**:
- `aria-label="画像を追加"`は**アイキャッチ画像（サムネイル）用のボタンのみ**に設定されている
- 本文エリアの「+」ボタンには`aria-label`が設定されていない
- 結果として、サムネイル用ボタンをクリックしてしまい、本文に画像が挿入されない

---

### 6. text=画像 セレクター方式

**試行内容**:
```javascript
// テキストで「画像」メニューを特定
await page.click('text=画像');
```

**失敗の原因**:
- `text=画像`は最初にマッチした要素をクリックする
- ページ内に「画像」というテキストが複数存在する可能性がある
- メニュー項目ではなく、別の要素をクリックしてしまう

---

### 7. filechooserイベント待機なしのクリック

**試行内容**:
```javascript
// 「画像」メニューをクリックしてから待機
await imageMenu.click();
await page.waitForTimeout(5000);
```

**失敗の原因**:
- `filechooser`イベントはクリックと同時に発火する
- クリック後に待機しても、イベントはすでに発火済みでキャッチできない
- ファイル選択ダイアログが開いても、ファイルを設定できない

---

## 成功した方法

### 最終的な成功コード

```javascript
// 1. 本文エリアの「+」ボタンを特定（位置条件で絞り込み）
const allBtns = await page.$$('button');
for (const btn of allBtns) {
    const box = await btn.boundingBox();
    if (box &&
        box.x > bodyBoxHandle.x - 100 &&
        box.x < bodyBoxHandle.x &&
        box.y > bodyBoxHandle.y &&
        box.y < bodyBoxHandle.y + 200 &&
        box.width < 60) {
        // ホバーしてからクリック
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForTimeout(300);
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        break;
    }
}

// 2. メニュー内の「画像」項目を正確に特定
const imageMenuItem = page.locator('[role="menuitem"]:has-text("画像")').first();

// 3. filechooserイベントとクリックを同時に待機
[chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 10000 }),
    imageMenuItem.click(),
]);

// 4. ファイルを設定
await chooser.setFiles(testImagePath);
```

---

## 成功の要因

### 1. 「+」ボタンの正確な特定

**ポイント**:
- 全ボタンをスキャンし、**位置条件**で本文エリアの「+」ボタンを特定
- 条件: 本文エリアの左側（x座標）、本文エリア内（y座標）、小さいサイズ（width < 60）

**なぜ重要か**:
- `aria-label`がないため、属性での特定が不可能
- 座標固定では画面サイズ変更に対応できない
- 相対位置で特定することで、動的なレイアウトに対応

---

### 2. role="menuitem"セレクターの使用

**ポイント**:
```javascript
page.locator('[role="menuitem"]:has-text("画像")')
```

**なぜ重要か**:
- メニュー項目には`role="menuitem"`属性が設定されている
- `text=画像`だけでは他の要素にもマッチする可能性がある
- `role`属性と`:has-text()`の組み合わせで、正確にメニュー項目を特定

---

### 3. Promise.allによるfilechooserイベント待機

**ポイント**:
```javascript
[chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 10000 }),
    imageMenuItem.click(),
]);
```

**なぜ重要か**:
- `filechooser`イベントはクリックと**同時に**発火する
- クリック後に`waitForEvent`を呼んでも、イベントはすでに発火済み
- `Promise.all`で同時に待機することで、イベントを確実にキャッチ

---

### 4. ホバー→クリックの2段階操作

**ポイント**:
```javascript
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.waitForTimeout(300);
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
```

**なぜ重要か**:
- 「+」ボタンはホバー時のみアクティブになる可能性がある
- 直接クリックでは反応しない場合がある
- ホバーで要素を表示させてからクリックすることで確実に操作

---

## 学んだ教訓

### 1. noteエディタの構造理解

- **アイキャッチ画像**と**本文画像**は異なるUIフロー
- アイキャッチ: `aria-label="画像を追加"`ボタン
- 本文: 「+」ボタン → メニュー → 「画像」項目

### 2. Playwrightのイベント待機

- `filechooser`イベントは**クリックと同時に**発火する
- `Promise.all`で同時待機が必須
- 参考コードのパターンを活用

### 3. 動的UIの操作

- 固定座標ではなく、**相対位置**で要素を特定
- `role`属性やセマンティックなセレクターを優先
- ホバー→クリックの2段階操作で確実性を向上

---

## 今後の改善点

1. **エラーハンドリングの強化**: メニューが開かない場合のリトライ処理
2. **トリミングモーダル対応**: 画像サイズによってはトリミングが必要
3. **複数画像対応**: 連続して複数の画像を挿入する場合のフロー
4. **headlessモード対応**: 現在は`headless: false`で動作確認済み

---

## 参考資料

- 成功したスクリプト: `/Users/heavenlykiss0820/noteMCP/scripts/final-image-insert.mjs`
- 参考コード: ユーザー提供のサムネイル画像挿入スクリプト

---

**作成日**: 2024年12月19日  
**最終更新**: 2024年12月19日
