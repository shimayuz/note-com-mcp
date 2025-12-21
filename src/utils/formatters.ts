import {
  Note,
  FormattedNote,
  Comment,
  FormattedComment,
  Like,
  FormattedLike
} from "../types/note-types.js";
import { NoteUser, FormattedUser } from "../types/user-types.js";
import { Magazine, FormattedMagazine } from "../types/api-types.js";
import { FormattedMembershipNote, MembershipSummary, MembershipPlan } from "../types/membership-types.js";

// 記事データのフォーマット
export function formatNote(
  note: any,
  username?: string,
  includeUserDetails?: boolean,
  analyzeContent?: boolean
): FormattedNote {
  const user = note.user || {};

  // コンテンツ分析用データの整形
  const hasEyecatch = Boolean(note.eyecatch || note.sp_eyecatch);
  const imageCount = note.image_count || (note.pictures ? note.pictures.length : 0);
  const price = note.price || 0;
  const isPaid = price > 0;

  // eyecatchUrlを常に含める（複数のフィールド名に対応）
  const eyecatchUrl = note.eyecatch || note.sp_eyecatch || note.eyecatch_url || note.eyecatchUrl || note.thumbnail || null;

  // publishedAtを複数のフィールド名から取得
  const publishedAt = note.publishAt || note.publish_at || note.published_at || note.createdAt || note.created_at || '日付不明';

  return {
    id: note.id || "",
    key: note.key || "",
    title: note.name || "",
    body: note.body || note.noteDraft?.body || "",
    excerpt: note.body ? (note.body.length > 100 ? note.body.substring(0, 100) + '...' : note.body) : '本文なし',
    publishedAt,
    likesCount: note.likeCount || note.like_count || 0,
    commentsCount: note.commentsCount || note.comment_count || 0,
    user: username || user.nickname || "",
    url: `https://note.com/${username || user.urlname || 'unknown'}/n/${note.key || ''}`,
    status: note.status || "",
    isDraft: note.status === "draft",
    format: note.format || "",
    editUrl: `https://note.com/${username || user.urlname || 'unknown'}/n/${note.key || ''}/edit`,
    hasDraftContent: Boolean(note.noteDraft),
    lastUpdated: note.noteDraft?.updatedAt || note.createdAt || "",

    // eyecatchUrlを常に含める
    eyecatchUrl,

    // コンテンツ分析情報（常に含める、analyzeContent=trueの場合は詳細情報も追加）
    contentAnalysis: {
      hasEyecatch,
      eyecatchUrl,
      imageCount,
      hasVideo: note.type === "MovieNote" || Boolean(note.external_url),
      externalUrl: note.external_url || null,
      excerpt: note.body ? (note.body.length > 150 ? note.body.substring(0, 150) + '...' : note.body) : '',
      hasAudio: Boolean(note.audio),
      format: note.format || "unknown",
      highlightText: note.highlight || null,
      // 追加の詳細情報（analyzeContent=trueの場合のみ）
      ...(analyzeContent ? {
        bodyLength: note.body?.length || 0,
        wordCount: note.body ? note.body.split(/\s+/).length : 0
      } : {})
    },

    // 価格情報
    price,
    isPaid,
    priceInfo: note.price_info || {
      is_free: price === 0,
      has_multiple: false,
      has_subscription: false,
      oneshot_lowest_price: price
    },

    // 設定情報
    settings: {
      isLimited: note.is_limited || false,
      isTrial: note.is_trial || false,
      disableComment: note.disable_comment || false,
      isRefund: note.is_refund || false,
      isMembershipConnected: note.is_membership_connected || false,
      hasAvailableCirclePlans: note.has_available_circle_plans || false
    },

    // 著者情報（詳細オプション）
    author: {
      id: user.id || "",
      name: user.name || user.nickname || "",
      urlname: user.urlname || "",
      profileImageUrl: user.user_profile_image_path || "",
      details: includeUserDetails ? {
        followerCount: user.follower_count || 0,
        followingCount: user.following_count || 0,
        noteCount: user.note_count || 0,
        profile: user.profile || "",
        twitterConnected: Boolean(user.twitter_nickname),
        twitterNickname: user.twitter_nickname || null,
        isOfficial: user.is_official || false,
        hasCustomDomain: Boolean(user.custom_domain),
        hasLikeAppeal: Boolean(user.like_appeal_text || user.like_appeal_image),
        hasFollowAppeal: Boolean(user.follow_appeal_text)
      } : null
    }
  };
}

// ユーザーデータのフォーマット
export function formatUser(user: NoteUser): FormattedUser {
  return {
    id: user.id || "",
    nickname: user.nickname || "",
    urlname: user.urlname || "",
    bio: user.profile?.bio || user.bio || '',
    followersCount: user.followerCount || user.followersCount || 0,
    followingCount: user.followingCount || 0,
    notesCount: user.noteCount || user.notesCount || 0,
    magazinesCount: user.magazineCount || user.magazinesCount || 0,
    url: `https://note.com/${user.urlname || ''}`,
    profileImageUrl: user.profileImageUrl || ''
  };
}

// コメントデータのフォーマット
export function formatComment(comment: Comment): FormattedComment {
  return {
    id: comment.id || "",
    body: comment.body || "",
    user: comment.user?.nickname || "匿名ユーザー",
    publishedAt: comment.publishAt || ""
  };
}

// いいねデータのフォーマット
export function formatLike(like: Like): FormattedLike {
  return {
    id: like.id || "",
    user: like.user?.nickname || "匿名ユーザー",
    createdAt: like.createdAt || ""
  };
}

// マガジンデータのフォーマット
export function formatMagazine(magazine: Magazine): FormattedMagazine {
  return {
    id: magazine.id || "",
    name: magazine.name || "",
    description: magazine.description || "",
    notesCount: magazine.notesCount || 0,
    publishedAt: magazine.publishAt || "",
    user: magazine.user?.nickname || "匿名ユーザー",
    url: `https://note.com/${magazine.user?.urlname || ''}/m/${magazine.key || ''}`
  };
}

// メンバーシップ記事のフォーマット
export function formatMembershipNote(note: any): FormattedMembershipNote {
  return {
    id: note.id || "",
    title: note.name || note.title || "",
    excerpt: note.body ? (note.body.length > 100 ? note.body.substring(0, 100) + '...' : note.body) : '本文なし',
    publishedAt: note.publishAt || note.published_at || note.createdAt || note.created_at || '日付不明',
    likesCount: note.likeCount || note.likes_count || 0,
    commentsCount: note.commentsCount || note.comments_count || 0,
    user: note.user?.nickname || note.creator?.nickname || "",
    url: note.url || (note.user ? `https://note.com/${note.user.urlname}/n/${note.key || ''}` : ''),
    isMembersOnly: note.is_members_only || note.isMembersOnly || true
  };
}

// メンバーシップサマリーのフォーマット
export function formatMembershipSummary(summary: any): MembershipSummary {
  const circle = summary.circle || {};
  const owner = circle.owner || {};
  const plans = summary.circlePlans || [];
  const planNames = plans.map((plan: any) => plan.name || "").filter((name: string) => name);

  return {
    id: circle.id || summary.id || "",
    key: circle.key || summary.key || "",
    name: circle.name || summary.name || "",
    urlname: circle.urlname || owner.urlname || "",
    price: circle.price || summary.price || 0,
    description: circle.description || "",
    headerImagePath: summary.headerImagePath || circle.headerImagePath || "",
    creator: {
      id: owner.id || "",
      nickname: owner.nickname || "",
      urlname: owner.urlname || "",
      profileImageUrl: owner.userProfileImagePath || ""
    },
    plans: planNames,
    joinedAt: circle.joinedAt || ""
  };
}

// メンバーシッププランのフォーマット
export function formatMembershipPlan(plan: any): MembershipPlan {
  const circle = plan.circle || {};
  const circlePlans = plan.circlePlans || [];
  const owner = circle.owner || {};

  return {
    id: circle.id || plan.id || "",
    key: circle.key || plan.key || "",
    name: circlePlans.length > 0 ? circlePlans[0].name || "" : circle.name || plan.name || "",
    description: circle.description || plan.description || "",
    price: plan.price || circle.price || 0,
    memberCount: circle.subscriptionCount || circle.membershipNumber || 0,
    notesCount: plan.notesCount || 0,
    status: circle.isCirclePublished ? "active" : "inactive",
    ownerName: owner.nickname || owner.name || "",
    headerImagePath: plan.headerImagePath || circle.headerImagePath || "",
    plans: circlePlans.map((p: any) => p.name || "").filter((n: string) => n),
    url: owner.customDomain ?
      `https://${owner.customDomain.host}/membership` :
      `https://note.com/${owner.urlname || ""}/membership`
  };
}

// 分析用データの集計
export function analyzeNotes(formattedNotes: FormattedNote[], query: string, sort: string) {
  return {
    totalFound: formattedNotes.length,
    analyzed: formattedNotes.length,
    query,
    sort,
    // エンゲージメント分析
    engagementAnalysis: {
      averageLikes: formattedNotes.reduce((sum, note) => sum + note.likesCount, 0) / formattedNotes.length || 0,
      averageComments: formattedNotes.reduce((sum, note) => sum + (note.commentsCount || 0), 0) / formattedNotes.length || 0,
      maxLikes: Math.max(...formattedNotes.map(note => note.likesCount)),
      maxComments: Math.max(...formattedNotes.map(note => note.commentsCount || 0))
    },
    // コンテンツタイプ分析
    contentTypeAnalysis: {
      withEyecatch: formattedNotes.filter(note => note.contentAnalysis?.hasEyecatch).length,
      withVideo: formattedNotes.filter(note => note.contentAnalysis?.hasVideo).length,
      withAudio: formattedNotes.filter(note => note.contentAnalysis?.hasAudio).length,
      averageImageCount: formattedNotes.reduce((sum, note) => sum + (note.contentAnalysis?.imageCount || 0), 0) / formattedNotes.length || 0
    },
    // 価格分析
    priceAnalysis: {
      free: formattedNotes.filter(note => !note.isPaid).length,
      paid: formattedNotes.filter(note => note.isPaid).length,
      averagePrice: formattedNotes.filter(note => note.isPaid).reduce((sum, note) => sum + (note.price || 0), 0) /
        formattedNotes.filter(note => note.isPaid).length || 0,
      maxPrice: Math.max(...formattedNotes.map(note => note.price || 0)),
      minPrice: Math.min(...formattedNotes.filter(note => note.isPaid).map(note => note.price || 0)) || 0
    },
    // 著者分析
    authorAnalysis: {
      uniqueAuthors: [...new Set(formattedNotes.map(note => note.author?.id))].length,
      averageFollowers: formattedNotes.reduce((sum, note) => sum + (note.author?.details?.followerCount || 0), 0) / formattedNotes.length || 0,
      maxFollowers: Math.max(...formattedNotes.map(note => note.author?.details?.followerCount || 0)),
      officialAccounts: formattedNotes.filter(note => note.author?.details?.isOfficial).length,
      withTwitterConnection: formattedNotes.filter(note => note.author?.details?.twitterConnected).length,
      withCustomEngagement: formattedNotes.filter(note =>
        note.author?.details?.hasLikeAppeal || note.author?.details?.hasFollowAppeal).length
    }
  };
}