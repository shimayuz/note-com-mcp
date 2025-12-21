/**
 * シンプルなMarkdownからHTMLへの変換ユーティリティ
 * note.comのHTML形式に最適化（UUID属性付き）
 *
 * note.com変換ルール：
 * - H1 → 大見出し (h2)
 * - H2 → 小見出し (h3)
 * - H3-H6 → 強調 (strong)
 * - 箇条書き → ul/li
 * - 番号付きリスト → ol/li
 * - コードブロック → pre/code
 * - 引用 → blockquote
 */

/**
 * UUID v4を生成する
 */
function generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * HTML要素にUUID属性を追加する
 */
function addUUIDAttributes(html: string): string {
    return html.replace(/<(\w+)([^>]*)>/g, (match, tag, attrs) => {
        if (tag === 'hr' || tag === 'br' || tag.includes('/')) {
            return match;
        }
        const uuid = generateUUID();
        return `<${tag}${attrs} name="${uuid}" id="${uuid}">`;
    });
}

/**
 * MarkdownをHTMLに変換する（note.com最適化版）
 */
export function convertMarkdownToHtml(markdown: string): string {
    if (!markdown) return "";

    // 改行を正規化
    let text = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // コードブロックを一時的にプレースホルダーに置換（他の変換から保護）
    const codeBlocks: string[] = [];
    text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (match, lang, code) => {
        const index = codeBlocks.length;
        // コード内の改行を保持、トリム
        const cleanCode = code.trim();
        codeBlocks.push(`<pre><code>${escapeHtml(cleanCode)}</code></pre>`);
        return `__CODE_BLOCK_${index}__`;
    });

    // インラインコードを一時的にプレースホルダーに置換
    const inlineCodes: string[] = [];
    text = text.replace(/`([^`\n]+)`/g, (match, code) => {
        const index = inlineCodes.length;
        inlineCodes.push(`<code>${escapeHtml(code)}</code>`);
        return `__INLINE_CODE_${index}__`;
    });

    // 行単位で処理
    const lines = text.split('\n');
    const result: string[] = [];
    let inList: 'ul' | 'ol' | null = null;
    let inBlockquote = false;
    let listItems: string[] = [];
    let blockquoteLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        // 空行の処理
        if (line.trim() === '') {
            // リストを閉じる
            if (inList) {
                result.push(`<${inList}>${listItems.map(item => `<li>${item}</li>`).join('')}</${inList}>`);
                listItems = [];
                inList = null;
            }
            // 引用を閉じる
            if (inBlockquote) {
                result.push(`<blockquote>${blockquoteLines.join('<br>')}</blockquote>`);
                blockquoteLines = [];
                inBlockquote = false;
            }
            continue;
        }

        // コードブロックプレースホルダー
        if (line.match(/^__CODE_BLOCK_\d+__$/)) {
            if (inList) {
                result.push(`<${inList}>${listItems.map(item => `<li>${item}</li>`).join('')}</${inList}>`);
                listItems = [];
                inList = null;
            }
            const index = parseInt(line.match(/\d+/)![0]);
            result.push(codeBlocks[index]);
            continue;
        }

        // 見出しの処理（note.comルール適用）
        const h1Match = line.match(/^# (.+)$/);
        if (h1Match) {
            if (inList) {
                result.push(`<${inList}>${listItems.map(item => `<li>${item}</li>`).join('')}</${inList}>`);
                listItems = [];
                inList = null;
            }
            result.push(`<h2>${processInline(h1Match[1])}</h2>`);
            continue;
        }

        const h2Match = line.match(/^## (.+)$/);
        if (h2Match) {
            if (inList) {
                result.push(`<${inList}>${listItems.map(item => `<li>${item}</li>`).join('')}</${inList}>`);
                listItems = [];
                inList = null;
            }
            result.push(`<h3>${processInline(h2Match[1])}</h3>`);
            continue;
        }

        const h3Match = line.match(/^### (.+)$/);
        if (h3Match) {
            if (inList) {
                result.push(`<${inList}>${listItems.map(item => `<li>${item}</li>`).join('')}</${inList}>`);
                listItems = [];
                inList = null;
            }
            // H3以降は強調として処理
            result.push(`<p><strong>${processInline(h3Match[1])}</strong></p>`);
            continue;
        }

        const h4PlusMatch = line.match(/^#{4,6} (.+)$/);
        if (h4PlusMatch) {
            if (inList) {
                result.push(`<${inList}>${listItems.map(item => `<li>${item}</li>`).join('')}</${inList}>`);
                listItems = [];
                inList = null;
            }
            result.push(`<p><strong>${processInline(h4PlusMatch[1])}</strong></p>`);
            continue;
        }

        // 水平線
        if (line.match(/^-{3,}$/) || line.match(/^\*{3,}$/)) {
            if (inList) {
                result.push(`<${inList}>${listItems.map(item => `<li>${item}</li>`).join('')}</${inList}>`);
                listItems = [];
                inList = null;
            }
            result.push('<hr>');
            continue;
        }

        // 引用の処理
        const quoteMatch = line.match(/^> (.+)$/);
        if (quoteMatch) {
            if (inList) {
                result.push(`<${inList}>${listItems.map(item => `<li>${item}</li>`).join('')}</${inList}>`);
                listItems = [];
                inList = null;
            }
            inBlockquote = true;
            blockquoteLines.push(processInline(quoteMatch[1]));
            continue;
        } else if (inBlockquote) {
            result.push(`<blockquote>${blockquoteLines.join('<br>')}</blockquote>`);
            blockquoteLines = [];
            inBlockquote = false;
        }

        // 箇条書きリストの処理
        const ulMatch = line.match(/^[\-\*] (.+)$/);
        if (ulMatch) {
            if (inList === 'ol') {
                result.push(`<ol>${listItems.map(item => `<li>${item}</li>`).join('')}</ol>`);
                listItems = [];
            }
            inList = 'ul';
            listItems.push(processInline(ulMatch[1]));
            continue;
        }

        // 番号付きリストの処理
        const olMatch = line.match(/^\d+\. (.+)$/);
        if (olMatch) {
            if (inList === 'ul') {
                result.push(`<ul>${listItems.map(item => `<li>${item}</li>`).join('')}</ul>`);
                listItems = [];
            }
            inList = 'ol';
            listItems.push(processInline(olMatch[1]));
            continue;
        }

        // リスト以外の行が来たらリストを閉じる
        if (inList) {
            result.push(`<${inList}>${listItems.map(item => `<li>${item}</li>`).join('')}</${inList}>`);
            listItems = [];
            inList = null;
        }

        // 通常の段落
        result.push(`<p>${processInline(line)}</p>`);
    }

    // 残りのリストを閉じる
    if (inList) {
        result.push(`<${inList}>${listItems.map(item => `<li>${item}</li>`).join('')}</${inList}>`);
    }
    if (inBlockquote) {
        result.push(`<blockquote>${blockquoteLines.join('<br>')}</blockquote>`);
    }

    let html = result.join('');

    // インラインコードを復元
    inlineCodes.forEach((code, index) => {
        html = html.replace(`__INLINE_CODE_${index}__`, code);
    });

    // コードブロックプレースホルダーが残っていれば復元（念のため）
    codeBlocks.forEach((code, index) => {
        html = html.replace(`__CODE_BLOCK_${index}__`, code);
    });

    return html.trim();
}

/**
 * インライン要素を処理
 */
function processInline(text: string): string {
    let result = text;

    // Obsidianハイライト (==text==) → 太字
    result = result.replace(/==(.+?)==/g, '<strong>$1</strong>');

    // 太字 (**text**)
    result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // 斜体 (*text*) - 太字の後に処理
    result = result.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // 取り消し線 (~~text~~)
    result = result.replace(/~~(.+?)~~/g, '<del>$1</del>');

    // リンク [text](url)
    result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

    // Obsidian内部リンク [[link]] or [[link|display]]
    result = result.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2');  // [[link|display]] → display
    result = result.replace(/\[\[([^\]]+)\]\]/g, '$1');  // [[link]] → link

    return result;
}

/**
 * HTMLエスケープ
 */
function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * HTMLをnote.com用にサニタイズする
 */
export function sanitizeHtmlForNote(html: string): string {
    if (!html) return "";

    // 危険なタグを削除
    const dangerousTags = ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button'];
    dangerousTags.forEach(tag => {
        const regex = new RegExp(`<${tag}[^>]*>.*?<\/${tag}>`, 'gis');
        html = html.replace(regex, '');
    });

    // 危険な属性を削除
    const dangerousAttributes = ['onclick', 'onload', 'onerror', 'onmouseover', 'onfocus'];
    dangerousAttributes.forEach(attr => {
        const regex = new RegExp(`\\s${attr}\\s*=\\s*["'][^"']*["']`, 'gis');
        html = html.replace(regex, '');
    });

    return html;
}

/**
 * Markdownをnote.com用のHTMLに変換する
 */
export function convertMarkdownToNoteHtml(markdown: string): string {
    const html = convertMarkdownToHtml(markdown);
    const htmlWithUUID = addUUIDAttributes(html);
    return sanitizeHtmlForNote(htmlWithUUID);
}
