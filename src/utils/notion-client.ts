import { Client } from '@notionhq/client';
import { NotionErrorCode, NotionPage, NotionBlock, NotionImage, ListPagesParams } from '../types/notion-types.js';
import { NOTION_API_VERSION, RATE_LIMIT_CONFIG, IMAGE_CONFIG } from '../config/notion-config.js';
import { env } from '../config/environment.js';

export class NotionClient {
    private client: Client;

    constructor() {
        if (!env.NOTION_TOKEN) {
            throw new Error('NOTION_TOKEN is required. Please set it in your environment variables.');
        }

        this.client = new Client({
            auth: env.NOTION_TOKEN,
            notionVersion: NOTION_API_VERSION,
        });
    }

    /**
     * 指数バックオフ付きリトライ処理
     */
    private async retryWithBackoff<T>(
        operation: () => Promise<T>,
        retries: number = RATE_LIMIT_CONFIG.MAX_RETRIES
    ): Promise<T> {
        let lastError: any;

        for (let i = 0; i <= retries; i++) {
            try {
                return await operation();
            } catch (error: any) {
                lastError = error;

                // リトライ不要なエラーは即時終了
                if (error.status === 401 || error.status === 403 || error.status === 404) {
                    throw error;
                }

                // Rate Limitの場合はRetry-Afterを待機
                if (error.status === 429) {
                    const retryAfter = error.headers?.['retry-after'] || RATE_LIMIT_CONFIG.INITIAL_RETRY_DELAY / 1000;
                    console.warn(`Rate limited. Waiting ${retryAfter} seconds...`);
                    await this.sleep(retryAfter * 1000);
                    continue;
                }

                // リトライ回数に達したらエラーをスロー
                if (i === retries) {
                    throw error;
                }

                // 指数バックオフで待機
                const delay = Math.min(
                    RATE_LIMIT_CONFIG.INITIAL_RETRY_DELAY * Math.pow(2, i),
                    RATE_LIMIT_CONFIG.MAX_RETRY_DELAY
                );
                console.warn(`Request failed. Retrying in ${delay}ms... (${i + 1}/${retries})`);
                await this.sleep(delay);
            }
        }

        throw lastError;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * ページ情報を取得
     */
    async getPage(pageId: string): Promise<NotionPage> {
        try {
            const page = await this.retryWithBackoff(() =>
                this.client.pages.retrieve({ page_id: pageId })
            );

            // Type guard to ensure we have a full page response
            if ('properties' in page && 'created_time' in page && 'last_edited_time' in page) {
                // プロパティからタイトルを抽出
                const title = this.extractTitleFromProperties(page.properties);

                return {
                    id: page.id,
                    created_time: page.created_time,
                    last_edited_time: page.last_edited_time,
                    properties: page.properties,
                    title,
                    url: page.url,
                };
            } else {
                throw new Error('Invalid page response from Notion API');
            }
        } catch (error: any) {
            this.handleError(error, 'Failed to get page');
            throw error;
        }
    }

    /**
     * ブロックを再帰的に取得
     */
    async getBlocks(blockId: string, recursive: boolean = true): Promise<NotionBlock[]> {
        try {
            const blocks: NotionBlock[] = [];
            let cursor: string | undefined;

            do {
                const response = await this.retryWithBackoff(() =>
                    this.client.blocks.children.list({
                        block_id: blockId,
                        page_size: RATE_LIMIT_CONFIG.BATCH_SIZE,
                        start_cursor: cursor,
                    })
                );

                for (const block of response.results) {
                    // Type guard to ensure we have a block object
                    if ('type' in block && 'has_children' in block) {
                        blocks.push(block as NotionBlock);

                        // 子ブロックがあれば再帰的に取得
                        if (recursive && block.has_children) {
                            const childBlocks = await this.getBlocks(block.id, true);
                            blocks.push(...childBlocks);
                        }
                    }
                }

                cursor = response.next_cursor as string | undefined;
            } while (cursor);

            return blocks;
        } catch (error: any) {
            this.handleError(error, 'Failed to get blocks');
            throw error;
        }
    }

    /**
     * データベースをクエリ
     */
    async queryDatabase(params: ListPagesParams): Promise<{ pages: NotionPage[]; next_cursor?: string }> {
        try {
            const requestParams: any = {
                page_size: params.page_size || 20,
            };

            if (params.filter) {
                requestParams.filter = params.filter;
            }

            if (params.sorts) {
                requestParams.sorts = params.sorts;
            }

            if (params.start_cursor) {
                requestParams.start_cursor = params.start_cursor;
            }

            const response = await this.retryWithBackoff(() =>
                this.client.databases.query({
                    database_id: params.database_id!,
                    ...requestParams,
                })
            );

            const pages = response.results.map((page: any) => {
                // Type guard to ensure we have a full page object
                if ('properties' in page && 'created_time' in page && 'last_edited_time' in page) {
                    const title = this.extractTitleFromProperties(page.properties);
                    return {
                        id: page.id,
                        created_time: page.created_time,
                        last_edited_time: page.last_edited_time,
                        properties: page.properties,
                        title,
                        url: page.url,
                    };
                }
                return null;
            }).filter(Boolean) as NotionPage[];

            return {
                pages,
                next_cursor: response.next_cursor as string | undefined,
            };
        } catch (error: any) {
            this.handleError(error, 'Failed to query database');
            throw error;
        }
    }

    /**
     * 画像をダウンロード
     */
    async downloadImage(url: string): Promise<{ buffer: Buffer; mimeType: string }> {
        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'note-mcp-client/1.0',
                },
            });

            if (!response.ok) {
                throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
            }

            const mimeType = response.headers.get('content-type') || 'image/jpeg';

            if (!IMAGE_CONFIG.SUPPORTED_FORMATS.includes(mimeType)) {
                throw new Error(`Unsupported image format: ${mimeType}`);
            }

            const buffer = Buffer.from(await response.arrayBuffer());

            if (buffer.length > IMAGE_CONFIG.MAX_SIZE_BYTES) {
                throw new Error(`Image too large: ${buffer.length} bytes (max: ${IMAGE_CONFIG.MAX_SIZE_BYTES})`);
            }

            return { buffer, mimeType };
        } catch (error: any) {
            this.handleError(error, 'Failed to download image');
            throw error;
        }
    }

    /**
     * プロパティからタイトルを抽出
     */
    private extractTitleFromProperties(properties: Record<string, any>): string {
        // タイトルプロパティを探す
        for (const [key, value] of Object.entries(properties)) {
            if (Array.isArray(value) && value.length > 0 && value[0].type === 'title') {
                return value[0].title?.[0]?.plain_text || 'Untitled';
            }
        }

        return 'Untitled';
    }

    /**
     * エラーハンドリング
     */
    private handleError(error: any, context: string): void {
        let errorCode = NotionErrorCode.SERVER_ERROR;
        let message = context;

        switch (error.status) {
            case 401:
                errorCode = NotionErrorCode.INVALID_TOKEN;
                message = 'Invalid Notion token. Please check your NOTION_TOKEN.';
                break;
            case 403:
                errorCode = NotionErrorCode.NO_ACCESS;
                message = 'Access denied. Please make sure the Notion Integration is connected to the page/database.';
                break;
            case 404:
                errorCode = NotionErrorCode.PAGE_NOT_FOUND;
                message = 'Page or database not found. Please check the ID.';
                break;
            case 429:
                errorCode = NotionErrorCode.RATE_LIMITED;
                message = 'Rate limit exceeded. Please try again later.';
                break;
            case 500:
            case 502:
            case 503:
                errorCode = NotionErrorCode.SERVER_ERROR;
                message = 'Notion server error. Please try again later.';
                break;
        }

        console.error(`${context}: ${message}`, error);
        error.code = errorCode;
        error.message = message;
    }
}
