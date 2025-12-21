# 開発ログ: MCP HTTPサーバー `net::ERR_EMPTY_RESPONSE` 調査と Playwright headless 誤認の切り分け

- **日付**: 2025-12-21
- **対象リポジトリ**: `noteMCP`
- **対象コンポーネント**: MCP HTTPサーバー (`src/note-mcp-server-http.ts`)、Playwright セッション更新 (`src/utils/playwright-session.ts`)

## 背景 / 目的

- **[症状]** Obsidian の Note Publisher から MCP HTTP サーバーへリクエストした際に、クライアント側で `net::ERR_EMPTY_RESPONSE` が発生することがある。
- **[目的]** どのリクエストで接続が落ちているか（URL/HTTPメソッド/タイミング）をサーバーログで捕捉し、サーバー側が *必ず* レスポンスを返すようにして原因特定を容易にする。
- **[追加の疑問]** 「headless のはずなのにログイン画面が開く」という報告があり、Playwright の `headless` 設定が無効化されている可能性を調査する。

## 観測された事実（ユーザーログ）

- **[Note Publisher のツール呼び出し]** `post-draft-note` を `http://localhost:3000/mcp` へ POST
- **[結果]** `Response status: 200`（下書き保存自体は成功）
- **[補足]** 画像が無い場合は `No images, using API-based post-draft-note` となり、Playwright 経由ではない投稿フローになる。

## 対応内容

### 1. MCP HTTP サーバーに詳細アクセスログを追加

- **[狙い]** `ERR_EMPTY_RESPONSE` は「サーバーがレスポンスを返す前に接続が閉じた」時に見えるため、リクエスト/レスポンスのライフサイクルを追跡できるようにする。
- **[変更]** `src/note-mcp-server-http.ts`
  - **[追加]** 連番の `requestId` と開始時刻
  - **[追加]** 受信時ログ（`method` / `url` / remote address / headers）
  - **[追加]** `Authorization` / `Cookie` などの秘匿情報のマスク（`sanitizeHeaders`）
  - **[追加]** POST の `body` バイト数ログ
  - **[追加]** イベントログ
    - `req`: `aborted` / `close` / `error`
    - `res`: `finish` / `close` / `error`

### 2. 未対応メソッドで接続がハングしないように改善

- **[狙い]** クライアントが `HEAD` を送るケース等でサーバーが応答せず、タイムアウト/切断 → `ERR_EMPTY_RESPONSE` につながる状況を避ける。
- **[変更]** `src/note-mcp-server-http.ts`
  - **[CORS改善]** `Access-Control-Allow-Methods` に `HEAD` を含める
  - **[CORS改善]** `Access-Control-Allow-Headers` に `Accept` を含める
  - **[HEAD対応]** `/mcp` と `/sse` に対する `HEAD` は `204 No Content` を返す
  - **[405対応]** `/mcp` / `/sse` で未対応メソッドは `405 Method Not Allowed` を返す

### 3. Playwright headless「誤認」切り分け

- **[現象]** 「headless なのにログイン画面が勝手に立ち上がった」
- **[切り分け結果]** Chromium(Playwright) ではなく、通常ブラウザのログイン画面だった
  - `post-draft-note` で成功レスポンスに `editUrl` が含まれるため、プラグインがそれを自動で開いた可能性が高い（＝Playwright headless とは無関係）

### 4. 起動時に Playwright を不必要に走らせない（副作用低減）

- **[狙い]** サーバー起動時認証で毎回 Playwright が走ると、誤認の温床になる＋重い。
- **[変更]** `src/note-mcp-server-http.ts` の `performAuthentication()`
  - **[変更]** `authStatus.hasCookie` がある場合は自動ログインをスキップ
  - **[変更]** `loginToNote()` を先に試し、失敗時のみ `refreshSessionWithPlaywright()` にフォールバック
  - **[追加]** `MCP_FORCE_AUTH_REFRESH=true` のときだけ強制的に更新

### 5. Playwright 実行時の headless 設定をログに出す

- **[狙い]** 「Playwright が動いているのか／その時 headless は何として評価されているか」をログで断定できるようにする。
- **[変更]** `src/utils/playwright-session.ts` の `refreshSessionWithPlaywright()`
  - **[追加]** `headless=${merged.headless} (PLAYWRIGHT_HEADLESS=...)` を出力

## 検証手順（簡易）

- **[HEAD疎通]**
  - `curl -svI --max-time 3 http://127.0.0.1:3000/mcp`
  - 期待: `204 No Content` が返り、タイムアウトしない

- **[Note Publisher 再実行]**
  - Note Publisher から `post-draft-note` を実行
  - 期待: サーバーログに `➡️ [HTTP n] ...` と `⬅️ [HTTP n] ... finish` が出る
  - `🛑 aborted` / `❌ error` / `🔌 close` のどれが出るかで、切断経路を追える

- **[Playwright 起動の有無確認]**
  - サーバーログに `🕹️ Playwrightでnote.comセッションを自動取得します...` が出るかを確認
  - 出ない場合: ブラウザが開いても Playwright ではなく通常ブラウザ由来の可能性が高い

## 現状の結論

- **[結論1]** `post-draft-note` の投稿成功（HTTP 200）は確認できており、少なくとも一部のフローは正常。
- **[結論2]** 「ログイン画面が開く」件は Chromium(Playwright) ではなく、通常ブラウザの可能性が高い（`editUrl` 自動オープン等）。
- **[結論3]** `ERR_EMPTY_RESPONSE` の原因特定に必要な観測（詳細アクセスログ＋HEAD/405応答）はサーバー側に実装済み。

## 次のアクション（未完）

- **[次]** `net::ERR_EMPTY_RESPONSE` が出た瞬間のサーバーログ（該当 `requestId` 一式）を採取して、どのルートでレスポンスが欠落しているかを確定する。
- **[次]** Note Publisher 側に「編集ページを自動で開く」設定がある場合は OFF にする（またはブラウザ側で note.com にログイン済みにする）ことで「ログイン画面が勝手に出る」誤認を減らす。
