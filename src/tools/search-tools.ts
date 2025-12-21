import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { noteApiRequest } from "../utils/api-client.js";
import { formatNote, formatUser, formatMagazine, analyzeNotes } from "../utils/formatters.js";
import { 
  createSuccessResponse, 
  createErrorResponse, 
  handleApiError, 
  safeExtractData, 
  safeExtractTotal,
  commonExtractors 
} from "../utils/error-handler.js";
import { env } from "../config/environment.js";

export function registerSearchTools(server: McpServer) {
  // 1. 記事検索ツール
  server.tool(
    "search-notes",
    "記事を検索する",
    {
      query: z.string().describe("検索キーワード"),
      size: z.number().default(10).describe("取得する件数（最大20）"),
      start: z.number().default(0).describe("検索結果の開始位置"),
      sort: z.enum(["new", "popular", "hot"]).default("hot").describe("ソート順（new: 新着順, popular: 人気順, hot: 急上昇）"),
    },
    async ({ query, size, start, sort }) => {
      try {
        const data = await noteApiRequest(`/v3/searches?context=note&q=${encodeURIComponent(query)}&size=${size}&start=${start}&sort=${sort}`);

        if (env.DEBUG) {
          console.error(`API Response structure for search-notes: ${JSON.stringify(data, null, 2)}`);
        }

        if (!data || !data.data) {
          return createErrorResponse(`APIレスポンスが空です: ${JSON.stringify(data)}`);
        }

        if (data.status === "error" || data.error) {
          return createErrorResponse(`APIエラー: ${JSON.stringify(data)}`);
        }

        const notesArray = safeExtractData(data, commonExtractors.notes);
        const totalCount = safeExtractTotal(data, notesArray.length);
        
        const formattedNotes = notesArray.map(note => formatNote(note));

        return createSuccessResponse({
          total: totalCount,
          notes: formattedNotes,
          rawResponse: env.DEBUG ? data : undefined
        });
      } catch (error) {
        return handleApiError(error, "記事検索");
      }
    }
  );

  // 2. 記事分析ツール
  server.tool(
    "analyze-notes",
    "記事の詳細分析を行う（競合分析やコンテンツ成果の比較等）",
    {
      query: z.string().describe("検索キーワード"),
      size: z.number().default(20).describe("取得する件数（分析に十分なデータ量を確保するため、初期値は多め）"),
      start: z.number().default(0).describe("検索結果の開始位置"),
      sort: z.enum(["new", "popular", "hot"]).default("popular").describe("ソート順（new: 新着順, popular: 人気順, hot: 急上昇）"),
      includeUserDetails: z.boolean().default(true).describe("著者情報を詳細に含めるかどうか"),
      analyzeContent: z.boolean().default(true).describe("コンテンツの特徴（画像数、アイキャッチの有無など）を分析するか"),
      category: z.string().optional().describe("特定のカテゴリに絞り込む（オプション）"),
      dateRange: z.string().optional().describe("日付範囲で絞り込む（例: 7d=7日以内、2m=2ヶ月以内）"),
      priceRange: z.enum(["all", "free", "paid"]).default("all").describe("価格帯（all: 全て, free: 無料のみ, paid: 有料のみ）"),
    },
    async ({ query, size, start, sort, includeUserDetails, analyzeContent, category, dateRange, priceRange }) => {
      try {
        const params = new URLSearchParams({
          q: query,
          size: size.toString(),
          start: start.toString(),
          sort: sort
        });
        
        if (category) params.append("category", category);
        if (dateRange) params.append("date_range", dateRange);
        if (priceRange !== "all") params.append("price", priceRange);

        // 認証が必要なエンドポイントのため、requireAuth を true に設定
        const data = await noteApiRequest(
          `/v3/searches?context=note&${params.toString()}`,
          "GET",
          null,
          true
        );
        
        if (env.DEBUG) {
          console.error(`API Response structure for analyze-notes: ${JSON.stringify(data, null, 2)}`);
        }

        if (!data || !data.data) {
          return createErrorResponse(`APIレスポンスが空です: ${JSON.stringify(data)}`);
        }

        if (data.status === "error" || data.error) {
          return createErrorResponse(`APIエラー: ${JSON.stringify(data)}`);
        }

        const notesArray = safeExtractData(data, commonExtractors.notes);
        const totalCount = safeExtractTotal(data, notesArray.length);
        
        const formattedNotes = notesArray.map(note => 
          formatNote(note, undefined, includeUserDetails, analyzeContent)
        );

        const analytics = analyzeNotes(formattedNotes, query, sort);

        return createSuccessResponse({
          analytics,
          notes: formattedNotes
        });
      } catch (error) {
        return handleApiError(error, "記事分析");
      }
    }
  );

  // 3. ユーザー検索ツール
  server.tool(
    "search-users",
    "ユーザーを検索する",
    {
      query: z.string().describe("検索キーワード"),
      size: z.number().default(10).describe("取得する件数（最大20）"),
      start: z.number().default(0).describe("検索結果の開始位置"),
    },
    async ({ query, size, start }) => {
      try {
        const data = await noteApiRequest(`/v3/searches?context=user&q=${encodeURIComponent(query)}&size=${size}&start=${start}`);

        const usersArray = safeExtractData(data, commonExtractors.users);
        const totalCount = safeExtractTotal(data, usersArray.length);
        
        const formattedUsers = usersArray.map((user: any) => formatUser(user));

        return createSuccessResponse({
          total: totalCount,
          users: formattedUsers
        });
      } catch (error) {
        return handleApiError(error, "ユーザー検索");
      }
    }
  );

  // 4. マガジン検索ツール
  server.tool(
    "search-magazines",
    "マガジンを検索する",
    {
      query: z.string().describe("検索キーワード"),
      size: z.number().default(10).describe("取得する件数（最大20）"),
      start: z.number().default(0).describe("検索結果の開始位置"),
    },
    async ({ query, size, start }) => {
      try {
        const data = await noteApiRequest(`/v3/searches?context=magazine&q=${encodeURIComponent(query)}&size=${size}&start=${start}`);

        const magazinesArray = safeExtractData(data, commonExtractors.magazines);
        const totalCount = safeExtractTotal(data, magazinesArray.length);
        
        const formattedMagazines = magazinesArray.map((magazine: any) => formatMagazine(magazine));

        return createSuccessResponse({
          total: totalCount,
          magazines: formattedMagazines
        });
      } catch (error) {
        return handleApiError(error, "マガジン検索");
      }
    }
  );

  // 5. 全体検索ツール
  server.tool(
    "search-all",
    "note全体検索（ユーザー、ハッシュタグ、記事など）",
    {
      query: z.string().describe("検索キーワード"),
      context: z.string().default("user,hashtag,note").describe("検索コンテキスト（user,hashtag,noteなどをカンマ区切りで指定）"),
      mode: z.string().default("typeahead").describe("検索モード（typeaheadなど）"),
      size: z.number().default(10).describe("取得する件数（最大5件）"),
      sort: z.enum(["new", "popular", "hot"]).default("hot").describe("ソート順（new: 新着順, popular: 人気順, hot: 急上昇）"),
    },
    async ({ query, context, mode, size, sort }) => {
      try {
        const data = await noteApiRequest(
          `/v3/searches?context=${encodeURIComponent(context)}&mode=${encodeURIComponent(mode)}&q=${encodeURIComponent(query)}&size=${size}&sort=${sort}`,
          "GET",
          null,
          false
        );

        const result = {
          query,
          context,
          mode,
          size,
          results: {} as any
        };

        if (data.data) {
          // ユーザー検索結果
          if (data.data.users && Array.isArray(data.data.users)) {
            result.results.users = data.data.users.map((user: any) => ({
              id: user.id || "",
              nickname: user.nickname || "",
              urlname: user.urlname || "",
              bio: user.profile?.bio || user.bio || "",
              profileImageUrl: user.profileImageUrl || "",
              url: `https://note.com/${user.urlname || ''}`
            }));
          }

          // ハッシュタグ検索結果
          if (data.data.hashtags && Array.isArray(data.data.hashtags)) {
            result.results.hashtags = data.data.hashtags.map((tag: any) => ({
              name: tag.name || "",
              displayName: tag.displayName || tag.name || "",
              url: `https://note.com/hashtag/${tag.name || ''}`
            }));
          }

          // 記事検索結果
          if (data.data.notes) {
            let notesArray: any[] = [];
            
            if (Array.isArray(data.data.notes)) {
              notesArray = data.data.notes;
            } else if (typeof data.data.notes === 'object' && data.data.notes !== null) {
              const notesObj = data.data.notes as { contents?: any[] };
              if (notesObj.contents && Array.isArray(notesObj.contents)) {
                notesArray = notesObj.contents;
              }
            }
            
            result.results.notes = notesArray.map((note: any) => ({
              id: note.id || "",
              title: note.name || note.title || "",
              excerpt: note.body ? (note.body.length > 100 ? note.body.substring(0, 100) + '...' : note.body) : '',
              user: note.user?.nickname || 'unknown',
              publishedAt: note.publishAt || note.publish_at || '',
              url: `https://note.com/${note.user?.urlname || 'unknown'}/n/${note.key || ''}`
            }));
          }
        }

        return createSuccessResponse(result);
      } catch (error) {
        return handleApiError(error, "全体検索");
      }
    }
  );
}