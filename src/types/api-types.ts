import { Note, Comment, Like, Sticker } from "./note-types.js";
import { NoteUser } from "./user-types.js";

export interface Magazine {
  id?: string;
  name?: string;
  key?: string;
  description?: string;
  user?: NoteUser;
  publishAt?: string;
  notesCount?: number;
}

export interface FormattedMagazine {
  id: string;
  name: string;
  description: string;
  notesCount: number;
  publishedAt: string;
  user:
    | string
    | {
        id?: string;
        nickname?: string;
        urlname?: string;
      };
  url: string;
}

// APIレスポンスの型定義
export interface NoteApiResponse {
  data?: {
    notes?: Note[] | { contents?: any[]; total_count?: number };
    notesCount?: number;
    users?: NoteUser[];
    usersCount?: number;
    contents?: any[];
    totalCount?: number;
    limit?: number;
    magazines?: Magazine[];
    magazinesCount?: number;
    likes?: Like[];
    stickers?: Sticker[];
    memberships?: any[];
    membership_summaries?: any[];
    circles?: any[];
    plans?: any[];
    circle_plans?: any[];
    summaries?: any[];
    items?: any[];
    membership?: any;
    circle?: any;
    total?: number;
    total_count?: number;
    [key: string]: any;
  };
  comments?: Comment[];
  status?: string;
  error?: any;
  [key: string]: any;
}

// ツール共通のレスポンス型
export interface ToolResponse {
  [x: string]: unknown;
  content: Array<{
    type: "text";
    text: string;
  }>;
  isError?: boolean;
}

// エラーレスポンス型
export interface ErrorResponse extends ToolResponse {
  isError: true;
}
