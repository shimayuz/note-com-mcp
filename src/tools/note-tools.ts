import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { noteApiRequest } from "../utils/api-client.js";
import { formatNote, formatComment, formatLike } from "../utils/formatters.js";
import { convertMarkdownToNoteHtml } from "../utils/markdown-converter.js";
import {
  createSuccessResponse,
  createErrorResponse,
  createAuthErrorResponse,
  handleApiError
} from "../utils/error-handler.js";
import {
  hasAuth,
  buildAuthHeaders,
  getPreviewAccessToken,
} from "../utils/auth.js";
import { env } from "../config/environment.js";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

export function registerNoteTools(server: McpServer) {
  // 1. 記事詳細取得ツール
  server.tool(
    "get-note",
    "記事の詳細情報を取得する",
    {
      noteId: z.string().describe("記事ID（例: n4f0c7b884789）"),
    },
    async ({ noteId }) => {
      try {
        const params = new URLSearchParams({
          draft: "true",
          draft_reedit: "false",
          ts: Date.now().toString()
        });

        const data = await noteApiRequest(
          `/v3/notes/${noteId}?${params.toString()}`,
          "GET",
          null,
          true
        );

        const noteData = data.data || {};

        // デバッグ用にAPIレスポンスをログ出力
        console.log('Raw API response from note-tools:', JSON.stringify(noteData, null, 2));

        // formatNote関数を使って完全なレスポンスを生成
        const formattedNote = formatNote(
          noteData,
          noteData.user?.urlname || '',
          true, // includeUserDetails
          true  // analyzeContent
        );

        return createSuccessResponse(formattedNote);
      } catch (error) {
        return handleApiError(error, "記事取得");
      }
    }
  );

  // 2. コメント一覧取得ツール
  server.tool(
    "get-comments",
    "記事へのコメント一覧を取得する",
    {
      noteId: z.string().describe("記事ID"),
    },
    async ({ noteId }) => {
      try {
        const data = await noteApiRequest(`/v1/note/${noteId}/comments`);

        let formattedComments: any[] = [];
        if (data.comments) {
          formattedComments = data.comments.map(formatComment);
        }

        return createSuccessResponse({
          comments: formattedComments
        });
      } catch (error) {
        return handleApiError(error, "コメント取得");
      }
    }
  );

  // 3. スキ取得ツール
  server.tool(
    "get-likes",
    "記事のスキ一覧を取得する",
    {
      noteId: z.string().describe("記事ID"),
    },
    async ({ noteId }) => {
      try {
        const data = await noteApiRequest(`/v3/notes/${noteId}/likes`);

        let formattedLikes: any[] = [];
        if (data.data && data.data.likes) {
          formattedLikes = data.data.likes.map(formatLike);
        }

        return createSuccessResponse({
          likes: formattedLikes
        });
      } catch (error) {
        return handleApiError(error, "スキ一覧取得");
      }
    }
  );

  // 4. 記事下書き保存ツール（HTTPサーバー成功版を移植）
  server.tool(
    "post-draft-note",
    "下書き状態の記事を新規作成または更新する",
    {
      title: z.string().describe("記事のタイトル"),
      body: z.string().describe("記事の本文"),
      tags: z.array(z.string()).optional().describe("タグ（最大10個）"),
      id: z.string().optional().describe("既存の下書きID（既存の下書きを更新する場合）"),
    },
    async ({ title, body, tags, id }) => {
      try {
        if (!hasAuth()) {
          return createAuthErrorResponse();
        }

        // 下書き保存用のカスタムヘッダーを構築
        const buildCustomHeaders = () => {
          const headers = buildAuthHeaders();
          headers["content-type"] = "application/json";
          headers["origin"] = "https://editor.note.com";
          headers["referer"] = "https://editor.note.com/";
          headers["x-requested-with"] = "XMLHttpRequest";
          return headers;
        };

        // 新規作成の場合、まず空の下書きを作成
        if (!id) {
          console.error("新規下書きを作成します...");

          const createData = {
            body: "<p></p>",
            body_length: 0,
            name: title || "無題",
            index: false,
            is_lead_form: false
          };

          const headers = buildCustomHeaders();

          const createResult = await noteApiRequest(
            "/v1/text_notes",
            "POST",
            createData,
            true,
            headers
          );

          if (createResult.data?.id) {
            id = createResult.data.id.toString();
            const key = createResult.data.key || `n${id}`;
            console.error(`下書き作成成功: ID=${id}, key=${key}`);
          } else {
            throw new Error("下書きの作成に失敗しました");
          }
        }

        // 下書きを更新
        console.error(`下書きを更新します (ID: ${id})`);

        const updateData = {
          body: body || "",
          body_length: (body || "").length,
          name: title || "無題",
          index: false,
          is_lead_form: false
        };

        const headers = buildCustomHeaders();

        const data = await noteApiRequest(
          `/v1/text_notes/draft_save?id=${id}&is_temp_saved=true`,
          "POST",
          updateData,
          true,
          headers
        );

        const noteKey = `n${id}`;
        return createSuccessResponse({
          success: true,
          message: "記事を下書き保存しました",
          noteId: id,
          noteKey: noteKey,
          editUrl: `https://editor.note.com/notes/${noteKey}/edit/`,
          data: data
        });

      } catch (error) {
        console.error(`下書き保存処理でエラー: ${error}`);
        return handleApiError(error, "記事下書き保存");
      }
    }
  );

  // 4.5. 画像付き下書き作成ツール（API経由で画像を本文に挿入）
  server.tool(
    "post-draft-note-with-images",
    "画像付きの下書き記事を作成する（Playwrightなし、API経由で画像を本文に挿入）",
    {
      title: z.string().describe("記事のタイトル"),
      body: z.string().describe("記事の本文（Markdown形式、![[image.png]]形式の画像参照を含む）"),
      images: z.array(z.object({
        fileName: z.string().describe("ファイル名（例: image.png）"),
        base64: z.string().describe("Base64エンコードされた画像データ"),
        mimeType: z.string().optional().describe("MIMEタイプ（例: image/png）")
      })).optional().describe("Base64エンコードされた画像の配列"),
      tags: z.array(z.string()).optional().describe("タグ（最大10個）"),
      id: z.string().optional().describe("既存の下書きID（既存の下書きを更新する場合）"),
    },
    async ({ title, body, images, tags, id }) => {
      try {
        if (!hasAuth()) {
          return createAuthErrorResponse();
        }

        const buildCustomHeaders = () => {
          const headers = buildAuthHeaders();
          headers["content-type"] = "application/json";
          headers["origin"] = "https://editor.note.com";
          headers["referer"] = "https://editor.note.com/";
          headers["x-requested-with"] = "XMLHttpRequest";
          return headers;
        };

        // 画像をアップロードしてURLを取得
        const uploadedImages = new Map<string, string>();

        if (images && images.length > 0) {
          console.error(`${images.length}件の画像をアップロード中...`);

          for (const img of images) {
            try {
              const imageBuffer = Buffer.from(img.base64, 'base64');
              const fileName = img.fileName;
              const mimeType = img.mimeType || 'image/png';

              // Step 1: Presigned URLを取得
              const boundary1 = `----WebKitFormBoundary${Math.random().toString(36).substring(2)}`;
              const presignFormParts: Buffer[] = [];
              presignFormParts.push(Buffer.from(
                `--${boundary1}\r\n` +
                `Content-Disposition: form-data; name="filename"\r\n\r\n` +
                `${fileName}\r\n`
              ));
              presignFormParts.push(Buffer.from(`--${boundary1}--\r\n`));
              const presignFormData = Buffer.concat(presignFormParts);

              const presignResponse = await noteApiRequest(
                '/v3/images/upload/presigned_post',
                'POST',
                presignFormData,
                true,
                {
                  'Content-Type': `multipart/form-data; boundary=${boundary1}`,
                  'Content-Length': presignFormData.length.toString(),
                  'X-Requested-With': 'XMLHttpRequest',
                  'Referer': 'https://editor.note.com/'
                }
              );

              if (!presignResponse.data?.post) {
                console.error(`Presigned URL取得失敗: ${fileName}`);
                continue;
              }

              const { url: finalImageUrl, action: s3Url, post: s3Params } = presignResponse.data;

              // Step 2: S3にアップロード
              const boundary2 = `----WebKitFormBoundary${Math.random().toString(36).substring(2)}`;
              const s3FormParts: Buffer[] = [];

              const paramOrder = ['key', 'acl', 'Expires', 'policy', 'x-amz-credential', 'x-amz-algorithm', 'x-amz-date', 'x-amz-signature'];
              for (const key of paramOrder) {
                if (s3Params[key]) {
                  s3FormParts.push(Buffer.from(
                    `--${boundary2}\r\n` +
                    `Content-Disposition: form-data; name="${key}"\r\n\r\n` +
                    `${s3Params[key]}\r\n`
                  ));
                }
              }

              s3FormParts.push(Buffer.from(
                `--${boundary2}\r\n` +
                `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
                `Content-Type: ${mimeType}\r\n\r\n`
              ));
              s3FormParts.push(imageBuffer);
              s3FormParts.push(Buffer.from('\r\n'));
              s3FormParts.push(Buffer.from(`--${boundary2}--\r\n`));

              const s3FormData = Buffer.concat(s3FormParts);

              const s3Response = await fetch(s3Url, {
                method: 'POST',
                headers: {
                  'Content-Type': `multipart/form-data; boundary=${boundary2}`,
                  'Content-Length': s3FormData.length.toString()
                },
                body: s3FormData
              });

              if (!s3Response.ok && s3Response.status !== 204) {
                console.error(`S3アップロード失敗: ${fileName} (${s3Response.status})`);
                continue;
              }

              uploadedImages.set(fileName, finalImageUrl);
              console.error(`画像アップロード成功: ${fileName} -> ${finalImageUrl}`);

            } catch (e: any) {
              console.error(`画像アップロードエラー: ${img.fileName}`, e.message);
            }
          }
        }

        // 本文内の画像参照をアップロードしたURLに置換
        let processedBody = body;

        // Obsidian形式の画像参照を置換: ![[filename.png]] or ![[filename.png|caption]]
        processedBody = processedBody.replace(
          /!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
          (match, fileName, caption) => {
            const cleanFileName = fileName.trim();
            const baseName = path.basename(cleanFileName);
            if (uploadedImages.has(baseName)) {
              const imageUrl = uploadedImages.get(baseName)!;
              const uuid1 = randomUUID();
              const uuid2 = randomUUID();
              return `<figure name="${uuid1}" id="${uuid2}"><img src="${imageUrl}" alt="" width="620" height="auto"><figcaption>${caption || ''}</figcaption></figure>`;
            }
            return match;
          }
        );

        // 標準Markdown形式の画像参照を置換: ![alt](path)
        processedBody = processedBody.replace(
          /!\[([^\]]*)\]\(([^)]+)\)/g,
          (match, alt, srcPath) => {
            if (srcPath.startsWith('http')) return match;
            const baseName = path.basename(srcPath);
            if (uploadedImages.has(baseName)) {
              const imageUrl = uploadedImages.get(baseName)!;
              const uuid1 = randomUUID();
              const uuid2 = randomUUID();
              return `<figure name="${uuid1}" id="${uuid2}"><img src="${imageUrl}" alt="" width="620" height="auto"><figcaption>${alt || ''}</figcaption></figure>`;
            }
            return match;
          }
        );

        // 新規作成の場合、まず空の下書きを作成
        if (!id) {
          console.error("新規下書きを作成します...");

          const createData = {
            body: "<p></p>",
            body_length: 0,
            name: title || "無題",
            index: false,
            is_lead_form: false
          };

          const headers = buildCustomHeaders();

          const createResult = await noteApiRequest(
            "/v1/text_notes",
            "POST",
            createData,
            true,
            headers
          );

          if (createResult.data?.id) {
            id = createResult.data.id.toString();
            const key = createResult.data.key || `n${id}`;
            console.error(`下書き作成成功: ID=${id}, key=${key}`);
          } else {
            throw new Error("下書きの作成に失敗しました");
          }
        }

        // Markdown→HTML変換（画像タグは既に挿入済みなので保持）
        console.error("Markdown→HTML変換中...");

        // figureタグを先に退避（convertMarkdownToNoteHtmlは<figure>タグを認識しないため）
        const figurePattern = /<figure[^>]*>[\s\S]*?<\/figure>/g;
        const figures: string[] = [];
        let bodyForConversion = processedBody.replace(figurePattern, (match: string) => {
          figures.push(match);
          return `__FIGURE_PLACEHOLDER_${figures.length - 1}__`;
        });

        // Markdown→HTML変換
        let htmlBody = convertMarkdownToNoteHtml(bodyForConversion);

        // figureタグを復元
        figures.forEach((figure, index) => {
          htmlBody = htmlBody.replace(`__FIGURE_PLACEHOLDER_${index}__`, figure);
          htmlBody = htmlBody.replace(`<p>__FIGURE_PLACEHOLDER_${index}__</p>`, figure);
        });

        console.error(`HTML変換完了 (${htmlBody.length} chars)`);

        // 下書きを更新（画像付き本文）
        console.error(`下書きを更新します (ID: ${id})`);

        const updateData = {
          body: htmlBody || "",
          body_length: (htmlBody || "").length,
          name: title || "無題",
          index: false,
          is_lead_form: false
        };

        const headers = buildCustomHeaders();

        const data = await noteApiRequest(
          `/v1/text_notes/draft_save?id=${id}&is_temp_saved=true`,
          "POST",
          updateData,
          true,
          headers
        );

        const noteKey = `n${id}`;
        return createSuccessResponse({
          success: true,
          message: "画像付き記事を下書き保存しました",
          noteId: id,
          noteKey: noteKey,
          editUrl: `https://editor.note.com/notes/${noteKey}/edit/`,
          uploadedImages: Array.from(uploadedImages.entries()).map(([name, url]) => ({ name, url })),
          imageCount: uploadedImages.size,
          data: data
        });

      } catch (error) {
        console.error(`画像付き下書き保存処理でエラー: ${error}`);
        return handleApiError(error, "画像付き記事下書き保存");
      }
    }
  );

  // 5. 記事編集ツール（既存記事の編集）
  server.tool(
    "edit-note",
    "既存の記事を編集する",
    {
      noteId: z.string().describe("編集する記事ID（例: n4f0c7b884789）"),
      title: z.string().describe("記事のタイトル"),
      body: z.string().describe("記事の本文"),
      tags: z.array(z.string()).optional().describe("タグ（最大10個）"),
      isDraft: z.boolean().optional().default(true).describe("下書き状態で保存するか（trueの場合下書き、falseの場合は公開）"),
    },
    async ({ noteId, title, body, tags, isDraft }) => {
      try {
        if (!hasAuth()) {
          return createAuthErrorResponse();
        }

        console.error(`記事編集リクエスト: ${noteId}`);

        // 新しいPUT APIエンドポイントを使用
        try {
          // noteIdから数値IDを抽出（get-noteで取得したidを使用）
          let numericId: string;
          if (noteId.startsWith('n')) {
            // 文字列IDの場合、まず記事情報を取得して数値IDを取得
            const noteInfo = await noteApiRequest(`/v3/notes/${noteId}`, "GET", null, true);
            numericId = noteInfo.id?.toString() || noteId;
          } else {
            numericId = noteId;
          }

          const postData = {
            title: title,
            body: body,
            status: isDraft ? "draft" : "published",
            tags: tags || []
          };

          const headers = buildAuthHeaders();

          // 新しいPUT APIエンドポイント
          const endpoint = `/api/v1/text_notes/${numericId}`;
          const data = await noteApiRequest(endpoint, "PUT", postData, true, headers);
          console.error(`PUT API 編集成功: ${JSON.stringify(data, null, 2)}`);

          return createSuccessResponse({
            success: true,
            data: data,
            message: isDraft ? "記事を下書き保存しました" : "記事を公開しました",
            noteId: noteId
          });
        } catch (error) {
          console.error(`PUT API編集エラー: ${error}`);
          return createErrorResponse(`記事の編集に失敗しました: ${error}`);
        }
      } catch (error) {
        console.error(`記事編集処理全体でエラー: ${error}`);
        return handleApiError(error, "記事編集");
      }
    }
  );

  // 6. 記事公開ツール
  server.tool(
    "publish-note",
    "下書き状態の記事を公開する",
    {
      noteId: z.string().describe("公開する記事ID"),
      title: z.string().optional().describe("公開時に変更する記事タイトル（省略可）"),
      body: z.string().optional().describe("公開時に変更する記事本文（省略可）"),
      tags: z.array(z.string()).optional().describe("公開時に設定するタグ（省略可）"),
    },
    async ({ noteId, title, body, tags }) => {
      try {
        if (!hasAuth()) {
          return createAuthErrorResponse();
        }

        console.error(`記事公開リクエスト: ${noteId}`);

        // 記事情報を先に取得
        let currentNote;
        try {
          const params = new URLSearchParams({
            draft: "true",
            draft_reedit: "false",
            ts: Date.now().toString()
          });

          const noteData = await noteApiRequest(
            `/v3/notes/${noteId}?${params.toString()}`,
            "GET",
            null,
            true
          );

          currentNote = noteData.data || {};
        } catch (getError) {
          console.error(`記事情報取得エラー: ${getError}`);
          return createErrorResponse(`指定された記事が存在しないか、アクセスできません: ${noteId}`);
        }

        // 公開APIリクエスト
        try {
          const postData = {
            title: title || currentNote.title,
            body: body || currentNote.body,
            status: "published",
            tags: tags || currentNote.tags || [],
            publish_at: null,
            eyecatch_image: currentNote.eyecatch_image || null,
            price: currentNote.price || 0,
            is_magazine_note: currentNote.is_magazine_note || false
          };

          const endpoint = `/v3/notes/${noteId}/publish`;

          const data = await noteApiRequest(endpoint, "POST", postData, true);
          console.error(`公開成功: ${JSON.stringify(data, null, 2)}`);

          return createSuccessResponse({
            success: true,
            data: data,
            message: "記事を公開しました",
            noteId: noteId,
            noteUrl: data.data?.url || `https://note.com/${env.NOTE_USER_ID}/n/${noteId}`
          });
        } catch (error) {
          console.error(`公開エラー: ${error}`);
          return createErrorResponse(
            `記事の公開に失敗しました: ${error}\n\nセッションの有効期限が切れている可能性があります。.envファイルのCookie情報を更新してください。`
          );
        }
      } catch (error) {
        console.error(`記事公開処理全体でエラー: ${error}`);
        return handleApiError(error, "記事公開");
      }
    }
  );

  // 7. コメント投稿ツール
  server.tool(
    "post-comment",
    "記事にコメントを投稿する",
    {
      noteId: z.string().describe("記事ID"),
      text: z.string().describe("コメント本文"),
    },
    async ({ noteId, text }) => {
      try {
        if (!hasAuth()) {
          return createAuthErrorResponse();
        }

        const data = await noteApiRequest(`/v1/note/${noteId}/comments`, "POST", { text }, true);

        return createSuccessResponse({
          message: "コメントを投稿しました",
          data: data
        });
      } catch (error) {
        return handleApiError(error, "コメント投稿");
      }
    }
  );

  // 6. スキをつけるツール
  server.tool(
    "like-note",
    "記事にスキをする",
    {
      noteId: z.string().describe("記事ID"),
    },
    async ({ noteId }) => {
      try {
        if (!hasAuth()) {
          return createAuthErrorResponse();
        }

        await noteApiRequest(`/v3/notes/${noteId}/likes`, "POST", {}, true);

        return createSuccessResponse({
          message: "スキをつけました"
        });
      } catch (error) {
        return handleApiError(error, "スキ");
      }
    }
  );

  // 7. スキを削除するツール
  server.tool(
    "unlike-note",
    "記事のスキを削除する",
    {
      noteId: z.string().describe("記事ID"),
    },
    async ({ noteId }) => {
      try {
        if (!hasAuth()) {
          return createAuthErrorResponse();
        }

        await noteApiRequest(`/v3/notes/${noteId}/likes`, "DELETE", {}, true);

        return createSuccessResponse({
          message: "スキを削除しました"
        });
      } catch (error) {
        return handleApiError(error, "スキ削除");
      }
    }
  );

  // 8. 自分の記事一覧（下書きを含む）取得ツール
  server.tool(
    "get-my-notes",
    "自分の記事一覧（下書きを含む）を取得する",
    {
      page: z.number().default(1).describe("ページ番号（デフォルト: 1）"),
      perPage: z.number().default(20).describe("1ページあたりの表示件数（デフォルト: 20）"),
      status: z.enum(["all", "draft", "public"]).default("all").describe("記事の状態フィルター（all:すべて, draft:下書きのみ, public:公開済みのみ）"),
    },
    async ({ page, perPage, status }) => {
      try {
        if (!env.NOTE_USER_ID) {
          return createErrorResponse("環境変数 NOTE_USER_ID が設定されていません。.envファイルを確認してください。");
        }

        const params = new URLSearchParams({
          page: page.toString(),
          per_page: perPage.toString(),
          draft: "true",
          draft_reedit: "false",
          ts: Date.now().toString()
        });

        if (status === "draft") {
          params.set("status", "draft");
        } else if (status === "public") {
          params.set("status", "public");
        }

        const data = await noteApiRequest(
          `/v2/note_list/contents?${params.toString()}`,
          "GET",
          null,
          true
        );

        if (env.DEBUG) {
          console.error(`API Response: ${JSON.stringify(data, null, 2)}`);
        }

        let formattedNotes: any[] = [];
        let totalCount = 0;

        if (data.data && data.data.notes && Array.isArray(data.data.notes)) {
          formattedNotes = data.data.notes.map((note: any) => {
            const isDraft = note.status === "draft";
            const noteKey = note.key || "";
            const noteId = note.id || "";

            const draftTitle = note.noteDraft?.name || "";
            const title = note.name || draftTitle || "(無題)";

            let excerpt = "";
            if (note.body) {
              excerpt = note.body.length > 100 ? note.body.substring(0, 100) + '...' : note.body;
            } else if (note.peekBody) {
              excerpt = note.peekBody;
            } else if (note.noteDraft?.body) {
              const textContent = note.noteDraft.body.replace(/<[^>]*>/g, '');
              excerpt = textContent.length > 100 ? textContent.substring(0, 100) + '...' : textContent;
            }

            const publishedAt = note.publishAt || note.publish_at || note.displayDate || note.createdAt || '日付不明';

            return {
              id: noteId,
              key: noteKey,
              title: title,
              excerpt: excerpt,
              publishedAt: publishedAt,
              likesCount: note.likeCount || 0,
              commentsCount: note.commentsCount || 0,
              status: note.status || "unknown",
              isDraft: isDraft,
              format: note.format || "",
              url: `https://note.com/${env.NOTE_USER_ID}/n/${noteKey}`,
              editUrl: `https://editor.note.com/notes/${noteId}/edit/`,
              hasDraftContent: note.noteDraft ? true : false,
              lastUpdated: note.noteDraft?.updatedAt || note.createdAt || "",
              user: {
                id: note.user?.id || env.NOTE_USER_ID,
                name: note.user?.name || note.user?.nickname || "",
                urlname: note.user?.urlname || env.NOTE_USER_ID
              }
            };
          });
        }

        totalCount = data.data?.totalCount || 0;

        return createSuccessResponse({
          total: totalCount,
          page: page,
          perPage: perPage,
          status: status,
          totalPages: Math.ceil(totalCount / perPage),
          hasNextPage: page * perPage < totalCount,
          hasPreviousPage: page > 1,
          draftCount: formattedNotes.filter((note: any) => note.isDraft).length,
          publicCount: formattedNotes.filter((note: any) => !note.isDraft).length,
          notes: formattedNotes
        });
      } catch (error) {
        return handleApiError(error, "記事一覧取得");
      }
    }
  );

  // 9. 記事編集ページを開くツール
  server.tool(
    "open-note-editor",
    "記事の編集ページを開く",
    {
      noteId: z.string().describe("記事ID（例: n1a2b3c4d5e6）"),
    },
    async ({ noteId }) => {
      try {
        if (!env.NOTE_USER_ID) {
          return createErrorResponse("環境変数 NOTE_USER_ID が設定されていません。.envファイルを確認してください。");
        }

        const editUrl = `https://editor.note.com/notes/${noteId}/edit/`;

        return createSuccessResponse({
          status: "success",
          editUrl: editUrl,
          message: `編集ページのURLを生成しました。以下のURLを開いてください：\n${editUrl}`
        });
      } catch (error) {
        return handleApiError(error, "編集ページURL生成");
      }
    }
  );
}