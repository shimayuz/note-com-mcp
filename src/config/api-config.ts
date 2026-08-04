// APIのベースURL
export const API_BASE_URL = "https://note.com/api";

// 共通ヘッダー
export const DEFAULT_HEADERS = {
  "Content-Type": "application/json",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36",
  Accept: "application/json",
};

// APIエンドポイント
export const API_ENDPOINTS = {
  // 認証
  LOGIN: "/v1/sessions/sign_in",
  CURRENT_USER: "/v2/current_user",

  // 検索
  SEARCH: "/v3/searches",

  // 記事
  NOTES: "/v3/notes",
  NOTE_COMMENTS: "/v1/note",
  NOTE_LIKES: "/v3/notes",
  NOTE_DRAFT: "/v3/notes/draft",
  NOTE_LIST: "/v2/note_list/contents",

  // ユーザー
  CREATORS: "/v2/creators",

  // メンバーシップ
  MEMBERSHIPS: "/v3/memberships",
  MEMBERSHIP_SUMMARIES: "/v2/circle/memberships/summaries",
  MEMBERSHIP_PLANS: "/v2/circle/plans",
  CIRCLE: "/v2/circle",

  // スティッカー
  NOTE_STICKERS: "/v3/notes",

  // その他
  CATEGORIES: "/v2/categories",
  HASHTAGS: "/v2/hashtags",
  MAGAZINES: "/v1/magazines",
  STATS: "/v1/stats/pv",
  NOTICE_COUNTS: "/v3/notice_counts",
} as const;

export type ApiEndpoint = keyof typeof API_ENDPOINTS;
