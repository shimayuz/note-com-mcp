// Notion API の設定

export const NOTION_API_VERSION = '2022-06-28';
export const NOTION_BASE_URL = 'https://api.notion.com';

// Rate Limit 設定
export const RATE_LIMIT_CONFIG = {
    MAX_RETRIES: 3,
    INITIAL_RETRY_DELAY: 1000, // 1秒
    MAX_RETRY_DELAY: 4000, // 4秒
    BATCH_SIZE: 100, // ブロック取得のバッチサイズ
};

// 画像設定
export const IMAGE_CONFIG = {
    MAX_SIZE_BYTES: 10 * 1024 * 1024, // 10MB
    SUPPORTED_FORMATS: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    TIMEOUT_MS: 30000, // 30秒
};

// ブロック変換設定
export const BLOCK_CONFIG = {
    MAX_RECURSION_DEPTH: 10, // 再帰の深さ制限
    UNSUPPORTED_BLOCK_WARNING: true, // 非対応ブロックの警告
};

// デフォルト値
export const DEFAULT_PAGE_SIZE = 20; // ページ一覧のデフォルト件数
