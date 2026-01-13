import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { NotionClient } from "../utils/notion-client.js";
import { NotionBlockParser } from "../utils/notion-block-parser.js";
import { NotionToNoteFormatter } from "../utils/notion-to-note-formatter.js";
import { NoteImageUploader, ImageData } from "../utils/note-image-uploader.js";
import { 
  ListNotionPagesArgs, 
  GetNotionPageArgs, 
  PreviewNotionToNoteArgs, 
  ImportNotionToNoteArgs,
  ImportResult,
  NotionErrorCode 
} from "../types/notion-types.js";
import { DEFAULT_PAGE_SIZE } from "../config/notion-config.js";
import {
  createSuccessResponse,
  createErrorResponse,
  createAuthErrorResponse,
  handleApiError
} from "../utils/error-handler.js";
import {
  hasAuth
} from "../utils/auth.js";
import { noteApiRequest } from "../utils/api-client.js";

/**
 * Notion関連のツールをMCPサーバーに登録する
 */
export function registerNotionTools(server: McpServer): void {
  // Notionクライアントと関連ユーティリティの初期化
  const notionClient = new NotionClient();
  const blockParser = new NotionBlockParser();
  const formatter = new NotionToNoteFormatter();

  // 1. list-notion-pages ツール
  server.tool(
    "list-notion-pages",
    "List pages from a Notion database",
    {
      databaseId: z.string().describe("Notion database ID to query"),
      pageSize: z.number().min(1).max(100).optional().describe("Number of pages to retrieve (default: 20)"),
    },
    async ({ databaseId, pageSize }) => {
      try {
        const result = await notionClient.queryDatabase({
          database_id: databaseId,
          page_size: pageSize || DEFAULT_PAGE_SIZE,
        });

        return createSuccessResponse({
          pages: result.pages.map(page => ({
            id: page.id,
            title: page.title,
            url: page.url,
            created_time: page.created_time,
            last_edited_time: page.last_edited_time,
          })),
          next_cursor: result.next_cursor,
        });
      } catch (error: any) {
        return handleApiError(error, "List Notion pages");
      }
    }
  );

  // 2. get-notion-page ツール
  server.tool(
    "get-notion-page",
    "Get detailed information about a Notion page",
    {
      pageId: z.string().describe("Notion page ID"),
    },
    async ({ pageId }) => {
      try {
        const page = await notionClient.getPage(pageId);
        const blocks = await notionClient.getBlocks(page.id, true);

        return createSuccessResponse({
          page: {
            id: page.id,
            title: page.title,
            url: page.url,
            created_time: page.created_time,
            last_edited_time: page.last_edited_time,
          },
          blocks: blocks.map(block => ({
            id: block.id,
            type: block.type,
            has_children: block.has_children,
          })),
        });
      } catch (error: any) {
        return handleApiError(error, "Get Notion page");
      }
    }
  );

  // 3. preview-notion-to-note ツール
  server.tool(
    "preview-notion-to-note",
    "Preview how a Notion page will be converted to note.com format",
    {
      pageId: z.string().describe("Notion page ID to preview"),
    },
    async ({ pageId }) => {
      try {
        // ページ情報とブロックを取得
        const page = await notionClient.getPage(pageId);
        const blocks = await notionClient.getBlocks(page.id, true);

        // IRに変換
        const irNodes = blockParser.parseBlocks(blocks);

        // Markdownに変換
        formatter.resetImageCounter();
        const markdown = formatter.formatToMarkdown(irNodes);

        // 画像参照を抽出
        const imageReferences = formatter.extractImageReferences(markdown);

        return createSuccessResponse({
          title: page.title,
          markdown,
          imageReferences,
          stats: {
            totalBlocks: blocks.length,
            convertedBlocks: irNodes.length,
            imageCount: imageReferences.length,
          },
        });
      } catch (error: any) {
        return handleApiError(error, "Preview Notion to note");
      }
    }
  );

  // 4. import-notion-to-note ツール
  server.tool(
    "import-notion-to-note",
    "Import a Notion page to note.com as a draft",
    {
      pageId: z.string().describe("Notion page ID to import"),
      tags: z.array(z.string()).optional().describe("Tags to add to the note (optional)"),
      saveAsDraft: z.boolean().optional().describe("Save as draft (default: true)").default(true),
    },
    async ({ pageId, tags, saveAsDraft }) => {
      try {
        const result = await importNotionToNote(
          notionClient,
          blockParser,
          formatter,
          pageId,
          tags || [],
          saveAsDraft !== false
        );

        if (result.success) {
          return createSuccessResponse({
            noteId: result.note_id,
            stats: result.stats,
            warnings: result.warnings,
            message: "Successfully imported Notion page to note.com",
          });
        } else {
          return createErrorResponse(result.error || "Failed to import Notion page");
        }
      } catch (error: any) {
        return handleApiError(error, "Import Notion to note");
      }
    }
  );
}

/**
 * Notionページをnote.comにインポートする内部関数
 */
async function importNotionToNote(
  notionClient: NotionClient,
  blockParser: NotionBlockParser,
  formatter: NotionToNoteFormatter,
  pageId: string,
  tags: string[],
  saveAsDraft: boolean
): Promise<ImportResult> {
  const result: ImportResult = {
    success: false,
    stats: {
      total_blocks: 0,
      converted_blocks: 0,
      skipped_blocks: 0,
      images_total: 0,
      images_success: 0,
      images_failed: 0,
    },
    warnings: [],
  };

  try {
    // note.comの認証チェック
    if (!hasAuth()) {
      throw new Error("note.comの認証情報が不足しています。");
    }
    
    // ページ情報とブロックを取得
    const page = await notionClient.getPage(pageId);
    const blocks = await notionClient.getBlocks(page.id, true);
    result.stats.total_blocks = blocks.length;

    // IRに変換
    const irNodes = blockParser.parseBlocks(blocks);
    result.stats.converted_blocks = irNodes.length;
    result.stats.skipped_blocks = blocks.length - irNodes.length;

    // Markdownに変換
    formatter.resetImageCounter();
    const markdown = formatter.formatToMarkdown(irNodes);

    // 画像参照を抽出
    const imageReferences = formatter.extractImageReferences(markdown);
    result.stats.images_total = imageReferences.length;

    // 画像をダウンロードしてBase64に変換
    const images: ImageData[] = [];
    
    for (const ref of imageReferences) {
      try {
        // IRから画像URLを取得
        const imageNode = irNodes.find(node => 
          node.type === 'image' && node.content && ref.includes(node.content.split('?')[0])
        );
        
        if (imageNode?.content) {
          const { buffer, mimeType } = await notionClient.downloadImage(imageNode.content);
          const base64 = buffer.toString('base64');
          
          images.push({
            fileName: ref,
            base64,
            mimeType,
          });
          
          result.stats.images_success++;
        }
      } catch (error: any) {
        result.stats.images_failed++;
        result.warnings.push(`Failed to download image ${ref}: ${error.message}`);
      }
    }
    
    // 画像をアップロード
    const uploadedImages = await NoteImageUploader.uploadImages(images);
    
    // Markdown内の画像参照をHTMLに置換
    const body = NoteImageUploader.replaceImageReferences(markdown, uploadedImages);
    
    // note.comに投稿
    const response = await noteApiRequest("/v3/notes", "POST", {
      title: page.title,
      body: body,
      status: saveAsDraft ? "draft" : "published",
      tags: tags,
    }, true);
    
    result.success = true;
    result.note_id = response.data?.id;
    
    return result;
  } catch (error: any) {
    result.error = error.message || error;
    return result;
  }
}
