/**
 * Markdown Metadata Extractor
 * Markdownファイルからタイトル、タグなどのメタデータを抽出
 */

export interface ArticleMetadata {
  title: string | null;
  tags: string[];
  description?: string;
}

/**
 * Markdownからタイトルを抽出
 */
export function extractTitle(content: string): string | null {
  // 最初のh1を探す
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) {
    return h1Match[1].trim();
  }

  // frontmatterからtitleを探す
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (frontmatterMatch) {
    const titleMatch = frontmatterMatch[1].match(/^title:\s*(.+)$/m);
    if (titleMatch) {
      return titleMatch[1].trim().replace(/^["']|["']$/g, '');
    }
  }

  return null;
}

/**
 * Markdownからタグを抽出
 */
export function extractTags(content: string): string[] {
  // frontmatterからtagsを探す
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (frontmatterMatch) {
    // インライン配列形式: tags: [tag1, tag2]
    const inlineTagsMatch = frontmatterMatch[1].match(/^tags:\s*\[([^\]]+)\]/m);
    if (inlineTagsMatch) {
      return inlineTagsMatch[1]
        .split(',')
        .map(tag => tag.trim().replace(/^["']|["']$/g, ''));
    }

    // YAML配列形式
    const yamlTagsMatch = frontmatterMatch[1].match(/^tags:\s*\n((?:\s*-\s*.+\n?)+)/m);
    if (yamlTagsMatch) {
      return yamlTagsMatch[1]
        .split('\n')
        .filter(line => line.trim().startsWith('-'))
        .map(line => line.replace(/^\s*-\s*/, '').trim().replace(/^["']|["']$/g, ''));
    }
  }

  // ハッシュタグを本文から抽出（フォールバック）
  const hashtagMatches = content.match(/#([^\s#]+)/g);
  if (hashtagMatches) {
    return [...new Set(hashtagMatches.map(tag => tag.slice(1)))].slice(0, 10);
  }

  return [];
}

/**
 * Markdownから説明文を抽出
 */
export function extractDescription(content: string): string | null {
  // frontmatterからdescriptionを探す
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (frontmatterMatch) {
    const descMatch = frontmatterMatch[1].match(/^description:\s*(.+)$/m);
    if (descMatch) {
      return descMatch[1].trim().replace(/^["']|["']$/g, '');
    }
  }

  // 最初の段落を説明文として使用
  const bodyMatch = content.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '');
  const firstParagraph = bodyMatch.match(/^(?!#)(.+?)(?:\n\n|\n#|$)/s);
  if (firstParagraph) {
    const text = firstParagraph[1].trim();
    if (text.length > 0 && text.length <= 200) {
      return text;
    }
  }

  return null;
}

/**
 * すべてのメタデータを抽出
 */
export function extractMetadata(content: string): ArticleMetadata {
  return {
    title: extractTitle(content),
    tags: extractTags(content),
    description: extractDescription(content) ?? undefined,
  };
}
