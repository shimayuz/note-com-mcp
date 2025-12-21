# Obsidian Note Publisher アイキャッチ機能実装開発手記

## 1. 背景と問題

### 1.1 課題
- Obsidianからnote.comへの記事公開において、アイキャッチ画像の設定がPlaywright UI自動化に依存していた
- Playwrightアプローチは不安定でタイムアウトが頻発
- ユーザーから「画像認識されない」「テキストのみ貼り付けられる」という報告

### 1.2 要件
- フロントマターの `eyecatch` フィールドで画像パスを指定
- APIベースの安定したアイキャッチ設定
- Playwright不要の純粋なAPI実装

## 2. 技術的課題

### 2.1 アーキテクチャの変更
```
旧: Obsidian → MCPサーバー → Playwright → note.com UI
新: Obsidian → MCPサーバー → note.com API
```

### 2.2 主要な技術的決定
- **eyecatch画像の送信方式**: Base64エンコードでJSONに含める
- **APIエンドポイント**: `/api/v1/image_upload/note_eyecatch` を使用
- **MCPツール**: `post-draft-note` を拡張してeyecatchに対応

## 3. 実装詳細

### 3.1 MCPサーバー側変更

#### post-draft-note ツールの拡張
```typescript
// 入力スキーマにeyecatchフィールドを追加
{
  name: "eyecatch",
  type: "object",
  properties: {
    fileName: { type: "string" },
    base64: { type: "string" },
    mimeType: { type: "string" }
  }
}

// アイキャッチアップロード処理
if (eyecatch) {
  console.log("🖼️ アイキャッチ画像をアップロード中...");
  const formData = new FormData();
  formData.append("file", base64ToBuffer(eyecatch.base64), eyecatch.fileName);
  
  const uploadResponse = await noteApiRequest("/api/v1/image_upload/note_eyecatch", {
    method: "POST",
    body: formData
  });
  
  // noteにeyecatchを設定
  await noteApiRequest(`/v1/text_notes/${noteId}`, {
    method: "PUT",
    body: JSON.stringify({ eyecatch_image_key: uploadResponse.key })
  });
}
```

### 3.2 Obsidianプラグイン側変更

#### パーサーの拡張
```typescript
// parser.tsにeyecatch抽出機能を追加
export function extractEyecatch(frontmatter: any, fileDir: string): ImageInfo | null {
  const eyecatchPath = frontmatter.eyecatch;
  if (!eyecatchPath) return null;
  
  const fullPath = path.resolve(fileDir, eyecatchPath);
  const exists = fs.existsSync(fullPath);
  
  if (exists) {
    const base64 = fs.readFileSync(fullPath, 'base64');
    return {
      fileName: path.basename(eyecatchPath),
      localPath: eyecatchPath,
      exists: true,
      base64,
      mimeType: `image/${path.extname(eyecatchPath).slice(1)}`
    };
  }
  return { fileName: path.basename(eyecatchPath), localPath: eyecatchPath, exists: false };
}
```

#### MCPクライアントの変更
```typescript
// 常にpost-draft-noteを使用するように変更
if (parsedMarkdown.eyecatch) {
  // eyecatchがある場合は必ずpost-draft-noteを使用
  return this.callTool("post-draft-note", {
    title: parsedMarkdown.title,
    body: parsedMarkdown.body,
    tags: parsedMarkdown.tags,
    eyecatch: parsedMarkdown.eyecatch
  });
}
```

### 3.3 UIの改善
- 確認モーダルにeyecatch情報を表示
- バージョン管理の導入（v1.0.0 → v1.1.0）

## 4. デプロイと運用上の問題

### 4.1 Vaultへの配布問題
- Obsidianは開発ソースフォルダではなく、Vaultの `.obsidian/plugins/` からプラグインを読み込む
- 手動でのファイルコピーが必要

**解決策**:
```bash
# 各Vaultにファイルをコピー
cp main.js manifest.json styles.css /path/to/vault/.obsidian/plugins/note-publisher/
```

### 4.2 ポート競合問題
- MCPサーバーがポート3000で起動失敗
- 既存プロセスがポートを占有

**解決策**:
- ポート3001でサーバーを起動
- プラグインのデフォルトURLを変更
- 環境変数 `MCP_HTTP_PORT` でポート指定

```bash
# サーバー起動
MCP_HTTP_PORT=3001 npm run dev:http

# プラグイン設定
mcpServerUrl: 'http://localhost:3001'
```

## 5. 学んだことと今後の改善

### 5.1 学び
1. **APIファーストの重要性**: UI自動化よりAPI信頼性が高い
2. **MCPサーバーの起動方式**: stdioとHTTPの違いを理解
3. **Obsidianプラグインの配布**: Vaultごとの管理が必要
4. **デバッグの重要性**: ログ出力の徹底が問題解決を加速

### 5.2 今後の改善案
1. **自動ビルド&配布スクリプト**:
   ```bash
   # 全Vaultへ一括配布
   for vault in /path/to/vaults/*; do
     cp build/* "$vault/.obsidian/plugins/note-publisher/"
   done
   ```

2. **ポート自動検出**:
   ```typescript
   // 使用可能なポートを自動検出
   const port = await findAvailablePort(3000, 3010);
   ```

3. **設定マイグレーション**:
   - バージョンアップ時の設定移行機能
   - ポート変更の自動検知と案内

## 6. 最終成果

### 6.1 機能
- ✅ フロントマター `eyecatch` での画像指定
- ✅ APIベースの安定したアイキャッチ設定
- ✅ Playwright不要の純粋なAPI実装
- ✅ 確認モーダルでのeyecatch状態表示

### 6.2 技術仕様
- **Note Publisher v1.1.0**
- **MCPサーバー v2.1.0**
- **通信**: HTTPポート3001
- **画像形式**: Base64エンコード
- **APIエンドポイント**: `/api/v1/image_upload/note_eyecatch`

### 6.3 成果物
- Obsidianプラグイン: `/obsidian-note-publisher/`
- MCPサーバー: `/noteMCP/`
- CHANGELOG.md: バージョン管理記録
- 開発ドキュメント: 完整な実装記録

---

*開発期間: 2025-12-21*
*担当: Cascade & heavenlykiss0820*
