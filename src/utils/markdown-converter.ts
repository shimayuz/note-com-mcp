/**
 * シンプルなMarkdownからHTMLへの変換ユーティリティ
 * note.comのHTML形式に最適化（UUID属性付き）
 *
 * note.com変換ルール（Obsidian基準）：
 * - H1, H2 → 大見出し (h2)
 * - H3 → 小見出し (h3)
 * - H4-H6 → 強調 (strong)
 * - 箇条書き → ul/li
 * - 番号付きリスト → ol/li
 * - コードブロック → pre/code
 * - 引用 → blockquote
 * - 段落内の単一改行 → <br>（同一パラグラフ内の改行を維持）
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
 * 行が特殊要素（見出し、リスト、引用など）かどうかを判定
 */
function isSpecialLine(line: string): boolean {
    const trimmed = line.trim();
    if (!trimmed) return false;
    
    // 見出し
    if (/^#{1,6} /.test(trimmed)) return true;
    // 箇条書き
    if (/^[\-\*] /.test(trimmed)) return true;
    // 番号付きリスト
    if (/^\d+\. /.test(trimmed)) return true;
    // 引用
    if (/^> /.test(trimmed)) return true;
    // 水平線
    if (/^-{3,}$/.test(trimmed) || /^\*{3,}$/.test(trimmed)) return true;
    // コードブロックプレースホルダー
    if (/^__CODE_BLOCK_\d+__$/.test(trimmed)) return true;
    
    return false;
}

/**
 * MarkdownをHTMLに変換する（note.com最適化版）
 * 段落内の単一改行は<br>に変換し、空行でパラグラフを区切る
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

    // 空行で段落を分割
    const paragraphs = text.split(/\n\n+/);
    const result: string[] = [];

    for (const paragraph of paragraphs) {
        const trimmedPara = paragraph.trim();
        if (!trimmedPara) continue;

        const lines = trimmedPara.split('\n');
        
        // 段落内のすべての行が特殊要素かどうかをチェック
        const hasSpecialLines = lines.some(line => isSpecialLine(line));
        
        if (hasSpecialLines) {
            // 特殊要素を含む段落は行単位で処理
            let inList: 'ul' | 'ol' | null = null;
            let listItems: string[] = [];
            let inBlockquote = false;
            let blockquoteLines: string[] = [];

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const trimmedLine = line.trim();
                
                if (!trimmedLine) continue;

                // コードブロックプレースホルダー
                if (trimmedLine.match(/^__CODE_BLOCK_\d+__$/)) {
                    if (inList) {
                        result.push(`<${inList}>${listItems.map(item => `<li>${item}</li>`).join('')}</${inList}>`);
                        listItems = [];
                        inList = null;
                    }
                    if (inBlockquote) {
                        result.push(`<blockquote>${blockquoteLines.join('<br>')}</blockquote>`);
                        blockquoteLines = [];
                        inBlockquote = false;
                    }
                    const index = parseInt(trimmedLine.match(/\d+/)![0]);
                    result.push(codeBlocks[index]);
                    continue;
                }

                // 見出しの処理（Obsidian→note.comルール適用）
                // H1 → 大見出し (h2)
                const h1Match = trimmedLine.match(/^# (.+)$/);
                if (h1Match) {
                    if (inList) {
                        result.push(`<${inList}>${listItems.map(item => `<li>${item}</li>`).join('')}</${inList}>`);
                        listItems = [];
                        inList = null;
                    }
                    if (inBlockquote) {
                        result.push(`<blockquote>${blockquoteLines.join('<br>')}</blockquote>`);
                        blockquoteLines = [];
                        inBlockquote = false;
                    }
                    result.push(`<h2>${processInline(h1Match[1])}</h2>`);
                    continue;
                }

                // H2 → 大見出し (h2)
                const h2Match = trimmedLine.match(/^## (.+)$/);
                if (h2Match) {
                    if (inList) {
                        result.push(`<${inList}>${listItems.map(item => `<li>${item}</li>`).join('')}</${inList}>`);
                        listItems = [];
                        inList = null;
                    }
                    if (inBlockquote) {
                        result.push(`<blockquote>${blockquoteLines.join('<br>')}</blockquote>`);
                        blockquoteLines = [];
                        inBlockquote = false;
                    }
                    result.push(`<h2>${processInline(h2Match[1])}</h2>`);
                    continue;
                }

                // H3 → 小見出し (h3)
                const h3Match = trimmedLine.match(/^### (.+)$/);
                if (h3Match) {
                    if (inList) {
                        result.push(`<${inList}>${listItems.map(item => `<li>${item}</li>`).join('')}</${inList}>`);
                        listItems = [];
                        inList = null;
                    }
                    if (inBlockquote) {
                        result.push(`<blockquote>${blockquoteLines.join('<br>')}</blockquote>`);
                        blockquoteLines = [];
                        inBlockquote = false;
                    }
                    result.push(`<h3>${processInline(h3Match[1])}</h3>`);
                    continue;
                }

                // H4以降 → 強調 (strong)
                const h4PlusMatch = trimmedLine.match(/^#{4,6} (.+)$/);
                if (h4PlusMatch) {
                    if (inList) {
                        result.push(`<${inList}>${listItems.map(item => `<li>${item}</li>`).join('')}</${inList}>`);
                        listItems = [];
                        inList = null;
                    }
                    if (inBlockquote) {
                        result.push(`<blockquote>${blockquoteLines.join('<br>')}</blockquote>`);
                        blockquoteLines = [];
                        inBlockquote = false;
                    }
                    result.push(`<p><strong>${processInline(h4PlusMatch[1])}</strong></p>`);
                    continue;
                }

                // 水平線
                if (trimmedLine.match(/^-{3,}$/) || trimmedLine.match(/^\*{3,}$/)) {
                    if (inList) {
                        result.push(`<${inList}>${listItems.map(item => `<li>${item}</li>`).join('')}</${inList}>`);
                        listItems = [];
                        inList = null;
                    }
                    if (inBlockquote) {
                        result.push(`<blockquote>${blockquoteLines.join('<br>')}</blockquote>`);
                        blockquoteLines = [];
                        inBlockquote = false;
                    }
                    result.push('<hr>');
                    continue;
                }

                // 引用の処理
                const quoteMatch = trimmedLine.match(/^> (.+)$/);
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
                const ulMatch = trimmedLine.match(/^[\-\*] (.+)$/);
                if (ulMatch) {
                    if (inBlockquote) {
                        result.push(`<blockquote>${blockquoteLines.join('<br>')}</blockquote>`);
                        blockquoteLines = [];
                        inBlockquote = false;
                    }
                    if (inList === 'ol') {
                        result.push(`<ol>${listItems.map(item => `<li>${item}</li>`).join('')}</ol>`);
                        listItems = [];
                    }
                    inList = 'ul';
                    listItems.push(processInline(ulMatch[1]));
                    continue;
                }

                // 番号付きリストの処理
                const olMatch = trimmedLine.match(/^\d+\. (.+)$/);
                if (olMatch) {
                    if (inBlockquote) {
                        result.push(`<blockquote>${blockquoteLines.join('<br>')}</blockquote>`);
                        blockquoteLines = [];
                        inBlockquote = false;
                    }
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

                // 通常のテキスト行（特殊要素の間に挟まれた場合）
                result.push(`<p>${processInline(trimmedLine)}</p>`);
            }

            // 残りのリスト・引用を閉じる
            if (inList) {
                result.push(`<${inList}>${listItems.map(item => `<li>${item}</li>`).join('')}</${inList}>`);
            }
            if (inBlockquote) {
                result.push(`<blockquote>${blockquoteLines.join('<br>')}</blockquote>`);
            }
        } else {
            // 特殊要素を含まない通常の段落
            // 段落内の単一改行を<br>に変換して1つの<p>タグで囲む
            const processedLines = lines.map(line => processInline(line.trim())).filter(line => line);
            if (processedLines.length > 0) {
                result.push(`<p>${processedLines.join('<br>')}</p>`);
            }
        }
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
