import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { noteApiRequest } from "../utils/api-client.js";
import { formatSticker } from "../utils/formatters.js";
import {
  createSuccessResponse,
  createAuthErrorResponse,
  handleApiError,
} from "../utils/error-handler.js";
import { hasAuth } from "../utils/auth.js";

export function registerStickerTools(server: McpServer) {
  // 1. 記事のスティッカー一覧取得ツール
  server.tool(
    "get-note-stickers",
    "記事に送られたスティッカー一覧を取得する",
    {
      noteId: z.string().describe("記事ID（例: n4f0c7b884789）"),
    },
    async ({ noteId }) => {
      try {
        const data = await noteApiRequest(`/v3/notes/${noteId}/stickers`);

        let formattedStickers: any[] = [];
        if (data.data && data.data.stickers) {
          formattedStickers = data.data.stickers.map(formatSticker);
        }

        return createSuccessResponse({
          noteId,
          stickers: formattedStickers,
          totalCount: formattedStickers.length,
        });
      } catch (error) {
        return handleApiError(error, "スティッカー一覧取得");
      }
    }
  );

  // 2. スティッカーを送るツール
  server.tool(
    "send-sticker",
    "記事にスティッカーを送る",
    {
      noteId: z.string().describe("記事ID（例: n4f0c7b884789）"),
      stickerType: z
        .string()
        .describe(
          "スティッカーの種類（例: heart, clap, fire, thumbsup, smile, party, star, sparkles, rocket, muscle）"
        ),
    },
    async ({ noteId, stickerType }) => {
      try {
        if (!hasAuth()) {
          return createAuthErrorResponse();
        }

        const postData = {
          sticker_type: stickerType,
        };

        await noteApiRequest(
          `/v3/notes/${noteId}/stickers`,
          "POST",
          postData,
          true
        );

        return createSuccessResponse({
          message: "スティッカーを送りました",
          noteId,
          stickerType,
        });
      } catch (error) {
        return handleApiError(error, "スティッカー送信");
      }
    }
  );

  // 3. スティッカーを削除するツール
  server.tool(
    "delete-sticker",
    "記事に送ったスティッカーを削除する",
    {
      noteId: z.string().describe("記事ID（例: n4f0c7b884789）"),
      stickerId: z.string().describe("削除するスティッカーID"),
    },
    async ({ noteId, stickerId }) => {
      try {
        if (!hasAuth()) {
          return createAuthErrorResponse();
        }

        await noteApiRequest(
          `/v3/notes/${noteId}/stickers/${stickerId}`,
          "DELETE",
          {},
          true
        );

        return createSuccessResponse({
          message: "スティッカーを削除しました",
          noteId,
          stickerId,
        });
      } catch (error) {
        return handleApiError(error, "スティッカー削除");
      }
    }
  );
}
