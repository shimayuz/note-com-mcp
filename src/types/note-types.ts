import { NoteUser } from "./user-types.js";

export interface Note {
  id?: string;
  name?: string;
  key?: string;
  body?: string;
  user?: NoteUser;
  publishAt?: string;
  likeCount?: number;
  commentsCount?: number;
  status?: string;
  type?: string;
  price?: number;
  format?: string;
  eyecatch?: string;
  sp_eyecatch?: string;
  image_count?: number;
  pictures?: any[];
  external_url?: string;
  audio?: any;
  highlight?: string;
  is_limited?: boolean;
  is_trial?: boolean;
  disable_comment?: boolean;
  is_refund?: boolean;
  is_membership_connected?: boolean;
  has_available_circle_plans?: boolean;
  price_info?: {
    is_free: boolean;
    has_multiple: boolean;
    has_subscription: boolean;
    oneshot_lowest_price: number;
  };
}

export interface FormattedNote {
  id: string;
  key?: string;
  title: string;
  excerpt?: string;
  body?: string;
  user: string | {
    id?: string;
    name?: string;
    nickname?: string;
    urlname?: string;
    bio?: string;
  };
  publishedAt: string;
  likesCount: number;
  commentsCount?: number;
  status?: string;
  isDraft?: boolean;
  format?: string;
  url: string;
  editUrl?: string;
  hasDraftContent?: boolean;
  lastUpdated?: string;
  // eyecatchUrlをトップレベルで常に含める
  eyecatchUrl?: string | null;
  // コンテンツ分析情報
  contentAnalysis?: {
    hasEyecatch: boolean;
    eyecatchUrl: string | null;
    imageCount: number;
    hasVideo: boolean;
    externalUrl: string | null;
    excerpt: string;
    hasAudio: boolean;
    format: string;
    highlightText: string | null;
    // 追加の詳細情報（analyzeContent=trueの場合）
    bodyLength?: number;
    wordCount?: number;
  };
  // 価格情報
  price?: number;
  isPaid?: boolean;
  priceInfo?: {
    is_free: boolean;
    has_multiple: boolean;
    has_subscription: boolean;
    oneshot_lowest_price: number;
  };
  // 設定情報
  settings?: {
    isLimited: boolean;
    isTrial: boolean;
    disableComment: boolean;
    isRefund: boolean;
    isMembershipConnected: boolean;
    hasAvailableCirclePlans: boolean;
  };
  // 著者情報
  author?: {
    id: string;
    name: string;
    urlname: string;
    profileImageUrl: string;
    details?: {
      followerCount: number;
      followingCount: number;
      noteCount: number;
      profile: string;
      twitterConnected: boolean;
      twitterNickname: string | null;
      isOfficial: boolean;
      hasCustomDomain: boolean;
      hasLikeAppeal: boolean;
      hasFollowAppeal: boolean;
    } | null;
  };
}

export interface Comment {
  id?: string;
  body?: string;
  user?: NoteUser;
  publishAt?: string;
}

export interface FormattedComment {
  id: string;
  body: string;
  user: string | {
    id?: string;
    nickname?: string;
    urlname?: string;
  };
  publishedAt: string;
}

export interface Like {
  id?: string;
  user?: NoteUser;
  createdAt?: string;
}

export interface FormattedLike {
  id: string;
  user: string | {
    id?: string;
    nickname?: string;
    urlname?: string;
  };
  createdAt: string;
}