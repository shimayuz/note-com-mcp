# note publisher 開発手記

## プロジェクト概要

**note publisher（note-mcp-server）** は、note.com の API を Claude Desktop、Cursor、n8n などの MCP クライアントから利用可能にする MCP（Model Context Protocol）サーバーです。

### 基本情報

- **バージョン**: 2.1.0
- **開発期間**: 2025年5月〜現在
- **主な技術スタック**: TypeScript, Node.js, Playwright, MCP SDK

---

## 開発の動機

note.com は日本で人気のブログプラットフォームですが、公式 API は限定的で、自動化やワークフロー統合が困難でした。

AI アシスタントから直接 note.com を操作できれば：
- 記事の検索・分析が自然言語で可能に
- 下書き作成・編集の自動化
- コンテンツワークフローの効率化

これらを実現するため、MCP サーバーの開発を開始しました。

---

## 技術的なチャレンジ

### 1. 非公式 API のリバースエンジニアリング

note.com には公式 API ドキュメントがないため、ブラウザの開発者ツールで実際のリクエストを解析しました。

**発見した主要エンドポイント**:
```
GET  /api/v3/notes/{noteId}        - 記事詳細取得
POST /api/v1/text_notes            - 下書き作成
POST /api/v1/text_notes/draft_save - 下書き更新
GET  /api/v2/note_list/contents    - 記事一覧取得
```

### 2. 下書き作成の2段階プロセス

最も困難だったのは下書き作成機能の実装です。

**初期の誤解（2025年11月7日）**:
- 422 Unprocessable Entity を「成功」と誤認
- 実際には API リクエストが拒否されていた

**正しい実装の発見（2025年11月8日）**:
Puppeteer でブラウザの実際の動作をキャプチャし、2段階プロセスが必要なことを発見。

```typescript
// ステップ1: 空の下書きを作成
POST /api/v1/text_notes
{
  body: "<p></p>",
  body_length: 0,
  name: "タイトル",
  index: false,
  is_lead_form: false
}
// → IDを取得

// ステップ2: 内容を更新
POST /api/v1/text_notes/draft_save?id={id}&is_temp_saved=true
{
  body: "実際の本文",
  body_length: 本文の長さ,
  name: "タイトル",
  ...
}
```

### 3. ドメインベースの CSRF 対策

note.com は `Origin` ヘッダーでリクエスト元を検証します。

**重要な発見**:
- 通常の `https://note.com` からのリクエストは拒否される
- `https://editor.note.com` からのリクエストのみ受け入れられる

```typescript
const headers = {
  "content-type": "application/json",
  "origin": "https://editor.note.com",
  "referer": "https://editor.note.com/",
  "x-requested-with": "XMLHttpRequest",
  "Cookie": "...",
  "X-XSRF-TOKEN": "..."
};
```

### 4. Playwright によるセッション自動取得

Cookie の手動取得は面倒なため、Playwright で自動化しました。

```typescript
// src/utils/playwright-session.ts
export async function refreshSessionWithPlaywright(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // ログインページに移動
  await page.goto("https://note.com/login");

  // メールとパスワードを入力
  await inputs[0].fill(env.NOTE_EMAIL);
  await inputs[1].fill(env.NOTE_PASSWORD);

  // ログインボタンをクリック
  await page.locator("button[type='submit']").click();

  // Cookie を取得して環境変数に設定
  const cookies = await context.cookies();
  // ...
}
```

**ポイント**:
- `--disable-blink-features=AutomationControlled` で自動化検出を回避
- ストレージ状態をファイルに保存して再利用
- ユーザー ID も `/api/v2/session` から自動取得

---

## アーキテクチャ

### モジュラー設計

2900行のモノリシックファイルを16のモジュールに分割しました。

```
src/
├── config/
│   ├── api-config.ts      # API設定
│   └── environment.ts     # 環境変数管理
├── types/
│   ├── note-types.ts      # 記事関連の型定義
│   ├── user-types.ts      # ユーザー関連の型定義
│   └── membership-types.ts
├── utils/
│   ├── api-client.ts      # HTTP クライアント
│   ├── auth.ts            # 認証管理
│   ├── formatters.ts      # データ整形
│   ├── error-handler.ts   # エラーハンドリング
│   ├── markdown-converter.ts
│   └── playwright-session.ts
├── tools/
│   ├── note-tools.ts      # 記事操作ツール
│   ├── search-tools.ts    # 検索ツール
│   ├── user-tools.ts      # ユーザーツール
│   ├── image-tools.ts     # 画像アップロード
│   ├── magazine-tools.ts
│   └── membership-tools.ts
├── prompts/
│   └── prompts.ts
├── note-mcp-server.ts           # stdio版
├── note-mcp-server-refactored.ts
└── note-mcp-server-http.ts      # HTTP/SSE版
```

**成果**:
- ファイルサイズ: 106KB → 7.5KB（93%削減）
- 起動速度向上
- 保守・拡張・テストが容易に

### トランスポート対応

**stdio トランスポート**:
- Claude Desktop のネイティブ接続
- ローカル環境での利用

**HTTP/SSE トランスポート**:
- Cloudflare Tunnel 経由でリモートアクセス
- n8n やその他のワークフローツールとの統合
- Cursor、ChatGPT からの接続

---

## 実装した主要機能

### 検索・閲覧（認証不要）

| ツール名 | 説明 |
|---------|------|
| `search-notes` | キーワードで記事検索 |
| `search-all` | note 全体検索（ユーザー、ハッシュタグ含む） |
| `analyze-notes` | 記事の詳細分析 |
| `get-note` | 記事詳細取得 |
| `search-users` | ユーザー検索 |
| `get-user` | ユーザー情報取得 |

### 記事操作（認証必須）

| ツール名 | 説明 |
|---------|------|
| `get-my-notes` | 自分の記事一覧（下書き含む） |
| `post-draft-note` | 下書き作成・更新 |
| `edit-note` | 既存記事の編集 |
| `publish-note` | 記事の公開 |

### その他

| ツール名 | 説明 |
|---------|------|
| `upload-image` | 画像アップロード |
| `like-note` / `unlike-note` | スキ操作 |
| `post-comment` | コメント投稿 |
| `get-stats` | PV 統計取得 |

---

## 学んだ教訓

### 1. 422エラーは失敗である

- **誤解**: 空のレスポンス = 成功
- **真実**: 422 Unprocessable Entity = リクエスト拒否
- **教訓**: 必ず実際のサービスで結果を確認する

### 2. UI の動作を完全に再現する

- 参照記事やドキュメントだけでは不十分
- ブラウザの Network タブで実際のリクエストを確認
- Puppeteer/Playwright でリクエストをキャプチャ

### 3. ヘッダーの重要性

- `Origin`、`Referer` ヘッダーは CSRF 対策で検証される
- 正しいドメイン（`editor.note.com`）を指定しないと拒否される

### 4. Git 履歴の活用

```bash
# 過去の成功実装を探す
git log --oneline -20
git show <commit-hash>:src/tools/note-tools.ts
```

セキュリティクリーンアップ後に実装が失われた際、Git 履歴から復元できた。

### 5. 段階的プロセスの理解

1つの API コールで完結すると仮定しない。多くの操作は複数のステップで構成される。

---

## 今後の展望

### 計画中の機能

- [ ] 画像埋め込み機能の改善
- [ ] 記事テンプレート機能
- [ ] スケジュール投稿対応
- [ ] より詳細な分析機能

### 技術的な改善

- [ ] エラーハンドリングの強化
- [ ] テストカバレッジの向上
- [ ] Docker デプロイメントの最適化

---

## 開発環境のセットアップ

```bash
# クローン
git clone https://github.com/shimayuz/note-com-mcp.git
cd note-com-mcp

# 依存関係インストール
npm install

# 環境変数設定
cp .env.example .env
# .env を編集

# ビルド & 起動
npm run build
npm run start:http  # HTTP版
npm run start       # stdio版
```

---

## 参考資料

- [MCP (Model Context Protocol)](https://modelcontextprotocol.io/)
- [Playwright Documentation](https://playwright.dev/)
- [note.com](https://note.com/)

---

**文書作成日**: 2025年12月21日
**作成者**: note-mcp-server 開発チーム
