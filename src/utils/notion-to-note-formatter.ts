import { NoteIRNode, RichTextSpan } from '../types/notion-types.js';

export class NotionToNoteFormatter {
    private imageCounter = 0;

    /**
     * IRノードの配列をMarkdownに変換
     */
    formatToMarkdown(nodes: NoteIRNode[]): string {
        const lines: string[] = [];

        for (const node of nodes) {
            const markdown = this.nodeToMarkdown(node);
            if (markdown) {
                lines.push(markdown);
            }
        }

        return lines.join('\n\n');
    }

    /**
     * 個別のIRノードをMarkdownに変換
     */
    private nodeToMarkdown(node: NoteIRNode, depth: number = 0): string {
        switch (node.type) {
            case 'heading':
                return this.headingToMarkdown(node);

            case 'paragraph':
                return this.paragraphToMarkdown(node);

            case 'bulletList':
                return this.bulletListToMarkdown(node, depth);

            case 'numberedList':
                return this.numberedListToMarkdown(node, depth);

            case 'todoList':
                return this.todoListToMarkdown(node, depth);

            case 'code':
                return this.codeToMarkdown(node);

            case 'quote':
                return this.quoteToMarkdown(node);

            case 'callout':
                return this.calloutToMarkdown(node);

            case 'divider':
                return '---';

            case 'image':
                return this.imageToMarkdown(node);

            case 'table':
                return this.tableToMarkdown(node);

            case 'tableRow':
                return this.tableRowToMarkdown(node);

            case 'tableCell':
                return this.tableCellToMarkdown(node);

            case 'bookmark':
                return this.bookmarkToMarkdown(node);

            case 'embed':
                return this.embedToMarkdown(node);

            case 'unsupported':
                return node.content || '';

            default:
                return '';
        }
    }

    /**
     * 見出しを変換（H1→H2, H2→H2, H3→H3 のルール）
     */
    private headingToMarkdown(node: NoteIRNode): string {
        const level = node.attributes?.level || 1;
        const text = this.richTextToMarkdown(node.richText || []);

        // note.comの仕様に合わせて見出しレベルを調整
        const markdownLevel = level === 1 ? 2 : level;
        const prefix = '#'.repeat(markdownLevel);

        return `${prefix} ${text}`;
    }

    /**
     * 段落を変換
     */
    private paragraphToMarkdown(node: NoteIRNode): string {
        return this.richTextToMarkdown(node.richText || []);
    }

    /**
     * 箇条書きリストを変換
     */
    private bulletListToMarkdown(node: NoteIRNode, depth: number = 0): string {
        const items = node.children || [];
        const lines: string[] = [];

        for (const item of items) {
            const text = this.richTextToMarkdown(item.richText || []);
            const indent = '  '.repeat(depth);
            lines.push(`${indent}- ${text}`);

            // 子要素（ネストしたリスト）を処理
            if (item.children && item.children.length > 0) {
                for (const child of item.children) {
                    lines.push(this.nodeToMarkdown(child, depth + 1));
                }
            }
        }

        return lines.join('\n');
    }

    /**
     * 番号付きリストを変換
     */
    private numberedListToMarkdown(node: NoteIRNode, depth: number = 0): string {
        const items = node.children || [];
        const lines: string[] = [];
        let counter = 1;

        for (const item of items) {
            const text = this.richTextToMarkdown(item.richText || []);
            const indent = '  '.repeat(depth);
            lines.push(`${indent}${counter}. ${text}`);
            counter++;

            // 子要素（ネストしたリスト）を処理
            if (item.children && item.children.length > 0) {
                for (const child of item.children) {
                    lines.push(this.nodeToMarkdown(child, depth + 1));
                }
            }
        }

        return lines.join('\n');
    }

    /**
     * TODOリストを変換
     */
    private todoListToMarkdown(node: NoteIRNode, depth: number = 0): string {
        const items = node.children || [];
        const lines: string[] = [];

        for (const item of items) {
            const text = this.richTextToMarkdown(item.richText || []);
            const checked = item.attributes?.checked || false;
            const indent = '  '.repeat(depth);
            const checkbox = checked ? '- [x]' : '- [ ]';
            lines.push(`${indent}${checkbox} ${text}`);
        }

        return lines.join('\n');
    }

    /**
     * コードブロックを変換
     */
    private codeToMarkdown(node: NoteIRNode): string {
        const language = node.attributes?.language || '';
        const content = node.content || '';

        return `\`\`\`${language}\n${content}\n\`\`\``;
    }

    /**
     * 引用を変換
     */
    private quoteToMarkdown(node: NoteIRNode): string {
        const text = this.richTextToMarkdown(node.richText || []);
        const lines = text.split('\n');

        return lines.map(line => `> ${line}`).join('\n');
    }

    /**
     * コールアウトを変換
     */
    private calloutToMarkdown(node: NoteIRNode): string {
        const icon = node.attributes?.icon || '';
        const text = this.richTextToMarkdown(node.richText || []);

        return `> ${icon} ${text}`;
    }

    /**
     * 画像を変換（Obsidian形式に統一）
     */
    private imageToMarkdown(node: NoteIRNode): string {
        const url = node.content || '';
        const caption = node.attributes?.caption || '';

        // 一意のファイル名を生成
        this.imageCounter++;
        const filename = `image${this.imageCounter}${this.getImageExtension(url)}`;

        // Obsidian形式の画像参照
        let markdown = `![[${filename}]]`;

        // キャプションがある場合は付加
        if (caption) {
            markdown += ` ${caption}`;
        }

        return markdown;
    }

    /**
     * テーブルを変換
     */
    private tableToMarkdown(node: NoteIRNode): string {
        // テーブルは子要素（tableRow）で処理される
        return '';
    }

    /**
     * テーブル行を変換
     */
    private tableRowToMarkdown(node: NoteIRNode): string {
        const cells = node.children || [];
        const cellTexts = cells.map(cell => this.tableCellToMarkdown(cell));

        return `| ${cellTexts.join(' | ')} |`;
    }

    /**
     * テーブルセルを変換
     */
    private tableCellToMarkdown(node: NoteIRNode): string {
        return this.richTextToMarkdown(node.richText || []).replace(/\|/g, '\\|');
    }

    /**
     * ブックマークを変換
     */
    private bookmarkToMarkdown(node: NoteIRNode): string {
        const url = node.content || '';
        const caption = node.attributes?.caption || url;

        return `[${caption}](${url})`;
    }

    /**
     * 埋め込みを変換
     */
    private embedToMarkdown(node: NoteIRNode): string {
        const url = node.content || '';

        return `[${url}](${url})`;
    }

    /**
     * リッチテキストをMarkdownに変換
     */
    private richTextToMarkdown(spans: RichTextSpan[]): string {
        if (!spans || spans.length === 0) {
            return '';
        }

        return spans.map(span => {
            let text = span.text;

            // アノテーションを適用
            if (span.annotations.bold) {
                text = `**${text}**`;
            }
            if (span.annotations.italic) {
                text = `*${text}*`;
            }
            if (span.annotations.strikethrough) {
                text = `~~${text}~~`;
            }
            if (span.annotations.underline) {
                text = `_${text}_`;
            }
            if (span.annotations.code) {
                text = `\`${text}\``;
            }

            // リンクを適用
            if (span.href) {
                text = `[${text}](${span.href})`;
            }

            return text;
        }).join('');
    }

    /**
     * URLから画像拡張子を推測
     */
    private getImageExtension(url: string): string {
        const lowerUrl = url.toLowerCase();

        if (lowerUrl.includes('.png')) return '.png';
        if (lowerUrl.includes('.jpg') || lowerUrl.includes('.jpeg')) return '.jpg';
        if (lowerUrl.includes('.gif')) return '.gif';
        if (lowerUrl.includes('.webp')) return '.webp';

        // デフォルトはPNG
        return '.png';
    }

    /**
     * 画像参照の正規化（Markdown内の ![[...]] を抽出）
     */
    extractImageReferences(markdown: string): string[] {
        const regex = /!\[\[([^\]]+)\]\]/g;
        const references: string[] = [];
        let match;

        while ((match = regex.exec(markdown)) !== null) {
            references.push(match[1]);
        }

        return references;
    }

    /**
     * 画像カウンターをリセット
     */
    resetImageCounter(): void {
        this.imageCounter = 0;
    }
}
