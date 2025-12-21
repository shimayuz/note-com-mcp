/**
 * Markdown to note.com HTML Converter
 * note.comの記事形式に最適化されたHTML変換を行う
 * 
 * シンプルな正規表現ベースの変換で、note.comに最適化
 */

export interface ConvertOptions {
  preserveLineBreaks?: boolean;
  removeFirstH1?: boolean;
  imageUrlMap?: Map<string, string>;  // 画像ファイル名 → アップロード済みURL
}

/**
 * HTMLエスケープ
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * インライン要素を変換
 */
function convertInline(text: string, imageUrlMap?: Map<string, string>): string {
  let result = text;
  
  // Obsidian Wikilink形式の画像 ![[image.png]] or ![[image.png|alt]]
  result = result.replace(/!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (match, fileName, altText) => {
    const alt = altText || fileName;
    if (imageUrlMap?.has(fileName)) {
      return `<figure><img src="${imageUrlMap.get(fileName)}" alt="${alt}"></figure>`;
    }
    return `<!-- 画像: ${fileName} -->`;
  });
  
  // 標準Markdown形式の画像 ![alt](url)
  result = result.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, src) => {
    // URLの場合はそのまま使用
    if (src.startsWith('http://') || src.startsWith('https://')) {
      return `<figure><img src="${src}" alt="${alt}"></figure>`;
    }
    // ローカルパスの場合はマップから検索
    const fileName = src.split('/').pop() || src;
    if (imageUrlMap?.has(fileName)) {
      return `<figure><img src="${imageUrlMap.get(fileName)}" alt="${alt}"></figure>`;
    }
    return `<!-- 画像: ${alt || src} -->`;
  });
  
  return result
    // 太字 **text** or __text__
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/__(.+?)__/g, '<b>$1</b>')
    // 斜体 *text* or _text_
    .replace(/\*(.+?)\*/g, '<i>$1</i>')
    .replace(/_(.+?)_/g, '<i>$1</i>')
    // インラインコード `code`
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // リンク [text](url)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

/**
 * MarkdownをNote.com用HTMLに変換
 */
export function convertMarkdownToNoteHtml(
  markdown: string,
  options: ConvertOptions = {}
): string {
  // Frontmatterを除去
  let content = markdown.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '');
  
  const lines = content.split('\n');
  const result: string[] = [];
  let inCodeBlock = false;
  let codeBlockContent: string[] = [];
  let inList = false;
  let listType: 'ul' | 'ol' = 'ul';
  let listItems: string[] = [];
  let firstH1Removed = false;

  const imageUrlMap = options.imageUrlMap;

  const flushList = () => {
    if (listItems.length > 0) {
      result.push(`<${listType}>`);
      listItems.forEach(item => result.push(`<li>${convertInline(item, imageUrlMap)}</li>`));
      result.push(`</${listType}>`);
      result.push('');
      listItems = [];
      inList = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // コードブロック処理
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        // コードブロック終了
        result.push(`<pre><code>${escapeHtml(codeBlockContent.join('\n'))}</code></pre>`);
        result.push('');
        codeBlockContent = [];
        inCodeBlock = false;
      } else {
        // コードブロック開始
        flushList();
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    // 空行
    if (line.trim() === '') {
      flushList();
      continue;
    }

    // 見出し
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushList();
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      
      // オプション: 最初のH1を除去（タイトルとして別途使用するため）
      if (options.removeFirstH1 && level === 1 && !firstH1Removed) {
        firstH1Removed = true;
        continue;
      }
      
      result.push(`<h${level}>${convertInline(text, imageUrlMap)}</h${level}>`);
      result.push('');
      continue;
    }

    // 水平線
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      flushList();
      result.push('<hr>');
      result.push('');
      continue;
    }

    // 引用
    if (line.startsWith('>')) {
      flushList();
      const quoteText = line.replace(/^>\s*/, '');
      result.push(`<blockquote>${convertInline(quoteText, imageUrlMap)}</blockquote>`);
      result.push('');
      continue;
    }

    // 順序なしリスト
    const ulMatch = line.match(/^[-*+]\s+(.+)$/);
    if (ulMatch) {
      if (!inList || listType !== 'ul') {
        flushList();
        inList = true;
        listType = 'ul';
      }
      listItems.push(ulMatch[1]);
      continue;
    }

    // 順序付きリスト
    const olMatch = line.match(/^\d+\.\s+(.+)$/);
    if (olMatch) {
      if (!inList || listType !== 'ol') {
        flushList();
        inList = true;
        listType = 'ol';
      }
      listItems.push(olMatch[1]);
      continue;
    }

    // Obsidian画像が単独行にある場合
    const obsidianImageMatch = line.match(/^!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/);
    if (obsidianImageMatch) {
      flushList();
      const fileName = obsidianImageMatch[1];
      const altText = obsidianImageMatch[2] || fileName;
      if (imageUrlMap?.has(fileName)) {
        result.push(`<figure><img src="${imageUrlMap.get(fileName)}" alt="${altText}"></figure>`);
      } else {
        result.push(`<!-- 画像: ${fileName} -->`);
      }
      result.push('');
      continue;
    }

    // 通常の段落
    flushList();
    result.push(`<p>${convertInline(line, imageUrlMap)}</p>`);
    result.push('');
  }

  // 残りのリストをフラッシュ
  flushList();

  return result.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Frontmatterを除去してMarkdown本文を取得
 */
export function extractMarkdownBody(content: string): string {
  // frontmatterパターン: ---で囲まれた部分
  const frontmatterRegex = /^---\s*\n[\s\S]*?\n---\s*\n/;
  return content.replace(frontmatterRegex, '').trim();
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
    const tagsMatch = frontmatterMatch[1].match(/^tags:\s*\[([^\]]+)\]/m);
    if (tagsMatch) {
      return tagsMatch[1]
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

  return [];
}
