// Notion → note.com Integration のための型定義

// 中間表現（IR）のノード型
export interface NoteIRNode {
    type: NoteIRNodeType;
    content?: string;
    children?: NoteIRNode[];
    attributes?: {
        level?: number;
        language?: string;
        url?: string;
        caption?: string;
        checked?: boolean;
        icon?: string;
        hasColumnHeader?: boolean;
        hasRowHeader?: boolean;
    };
    richText?: RichTextSpan[];
}

export type NoteIRNodeType =
    | 'heading'
    | 'paragraph'
    | 'bulletList'
    | 'numberedList'
    | 'todoList'
    | 'code'
    | 'quote'
    | 'callout'
    | 'divider'
    | 'image'
    | 'table'
    | 'tableRow'
    | 'tableCell'
    | 'embed'
    | 'bookmark'
    | 'unsupported';

// リッチテキストのスパン型
export interface RichTextSpan {
    text: string;
    annotations: {
        bold?: boolean;
        italic?: boolean;
        strikethrough?: boolean;
        underline?: boolean;
        code?: boolean;
    };
    href?: string;
}

// エラーコード列挙型
export enum NotionErrorCode {
    INVALID_TOKEN = 'INVALID_TOKEN',
    TOKEN_EXPIRED = 'TOKEN_EXPIRED',
    PAGE_NOT_FOUND = 'PAGE_NOT_FOUND',
    NO_ACCESS = 'NO_ACCESS',
    RATE_LIMITED = 'RATE_LIMITED',
    NETWORK_ERROR = 'NETWORK_ERROR',
    SERVER_ERROR = 'SERVER_ERROR',
    UNSUPPORTED_BLOCK = 'UNSUPPORTED_BLOCK',
    IMAGE_DOWNLOAD_FAILED = 'IMAGE_DOWNLOAD_FAILED',
    IMAGE_UPLOAD_FAILED = 'IMAGE_UPLOAD_FAILED',
}

// インポート結果の型
export interface ImportResult {
    success: boolean;
    note_id?: string;
    stats: {
        total_blocks: number;
        converted_blocks: number;
        skipped_blocks: number;
        images_total: number;
        images_success: number;
        images_failed: number;
    };
    warnings: string[];
    error?: string;
}

// Notion API のレスポンス型（簡易版）
export interface NotionPage {
    id: string;
    created_time: string;
    last_edited_time: string;
    properties: Record<string, any>;
    title: string;
    url: string;
}

export interface NotionBlock {
    id: string;
    type: string;
    created_time: string;
    last_edited_time: string;
    has_children: boolean;
    [key: string]: any; // type-specific properties
}

export interface NotionImage {
    url: string;
    caption?: string;
    type: 'file' | 'external';
}

export interface NotionDatabase {
    id: string;
    title: string;
    description?: string;
    url: string;
}

// API リクエストパラメータ
export interface ListPagesParams {
    database_id?: string;
    page_size?: number;
    start_cursor?: string;
    filter?: {
        property?: string;
        operator?: string;
        value?: any;
    };
    sorts?: Array<{
        property: string;
        direction: 'ascending' | 'descending';
    }>;
}

// MCP ツールの引数型
export interface ListNotionPagesArgs {
    databaseId?: string;
    pageSize?: number;
}

export interface GetNotionPageArgs {
    pageId: string;
}

export interface PreviewNotionToNoteArgs {
    pageId: string;
}

export interface ImportNotionToNoteArgs {
    pageId: string;
    tags?: string[];
    saveAsDraft?: boolean;
}
