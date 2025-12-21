import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from "fs";
import path from "path";

/**
 * 画像プレースホルダーの形式
 * 本文中: <!-- IMAGE_PLACEHOLDER:filename.png -->
 */
const IMAGE_PLACEHOLDER_PREFIX = "<!-- IMAGE_PLACEHOLDER:";
const IMAGE_PLACEHOLDER_SUFFIX = " -->";

/**
 * Obsidian Markdownをnote用HTMLに変換する
 * 画像はプレースホルダーに置換される
 */
function convertObsidianToNoteHtml(
    markdown: string,
    imageBasePath: string
): { html: string; images: { placeholder: string; localPath: string; fileName: string }[] } {
    const images: { placeholder: string; localPath: string; fileName: string }[] = [];
    let html = markdown;

    // Obsidianの画像記法を検出: ![[image.png]] または ![alt](path/to/image.png)
    // パターン1: ![[filename.png]]
    html = html.replace(/!\[\[([^\]]+)\]\]/g, (match, fileName) => {
        const cleanFileName = fileName.trim();
        const localPath = path.join(imageBasePath, cleanFileName);
        const placeholder = `${IMAGE_PLACEHOLDER_PREFIX}${cleanFileName}${IMAGE_PLACEHOLDER_SUFFIX}`;

        images.push({
            placeholder,
            localPath,
            fileName: cleanFileName
        });

        return placeholder;
    });

    // パターン2: ![alt](path/to/image.png)
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, imagePath) => {
        const cleanPath = imagePath.trim();
        const fileName = path.basename(cleanPath);
        const localPath = path.isAbsolute(cleanPath)
            ? cleanPath
            : path.join(imageBasePath, cleanPath);
        const placeholder = `${IMAGE_PLACEHOLDER_PREFIX}${fileName}${IMAGE_PLACEHOLDER_SUFFIX}`;

        images.push({
            placeholder,
            localPath,
            fileName
        });

        return placeholder;
    });

    // 基本的なMarkdown → HTML変換
    // 見出し
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // 太字・斜体
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // インラインコード
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // コードブロック
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
        return `<pre><code class="language-${lang || 'text'}">${escapeHtml(code.trim())}</code></pre>`;
    });

    // リンク
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

    // 箇条書き
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`);

    // 番号付きリスト
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

    // 引用
    html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');

    // 水平線
    html = html.replace(/^---$/gm, '<hr>');

    // 段落（空行で区切られたテキスト）
    const paragraphs = html.split(/\n\n+/);
    html = paragraphs.map(p => {
        const trimmed = p.trim();
        if (!trimmed) return '';
        // すでにHTMLタグで始まっている場合はそのまま
        if (trimmed.startsWith('<')) return trimmed;
        // プレースホルダーの場合はそのまま
        if (trimmed.startsWith('<!--')) return trimmed;
        // それ以外は段落タグで囲む
        return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`;
    }).filter(p => p).join('\n');

    return { html, images };
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
 * Obsidian連携ツールを登録する
 */
export function registerObsidianTools(server: McpServer): void {
    /**
     * Obsidian MarkdownをnoteのHTML形式に変換
     */
    server.tool(
        "convert-obsidian-markdown",
        "Obsidian MarkdownをnoteのHTML形式に変換（画像はプレースホルダーに置換）",
        {
            markdownPath: z.string().optional().describe("Markdownファイルのパス"),
            markdownContent: z.string().optional().describe("Markdownの内容（markdownPathの代わりに使用可能）"),
            imageBasePath: z.string().optional().describe("画像ファイルの基準パス（デフォルト: Markdownファイルと同じディレクトリ）"),
        },
        async ({ markdownPath, markdownContent, imageBasePath }) => {
            try {
                let markdown: string;
                let basePath: string;

                if (markdownPath) {
                    if (!fs.existsSync(markdownPath)) {
                        throw new Error(`ファイルが見つかりません: ${markdownPath}`);
                    }
                    markdown = fs.readFileSync(markdownPath, 'utf-8');
                    basePath = imageBasePath || path.dirname(markdownPath);
                } else if (markdownContent) {
                    markdown = markdownContent;
                    basePath = imageBasePath || process.cwd();
                } else {
                    throw new Error('markdownPathまたはmarkdownContentを指定してください');
                }

                // タイトルを抽出（最初の# 見出し）
                const titleMatch = markdown.match(/^# (.+)$/m);
                const title = titleMatch ? titleMatch[1].trim() : '無題';

                // タイトル行を本文から除去
                let body = markdown;
                if (titleMatch) {
                    body = markdown.replace(/^# .+\n?/, '');
                }

                // Frontmatterを除去（---で囲まれた部分）
                body = body.replace(/^---\n[\s\S]*?\n---\n?/, '');

                // 変換実行
                const { html, images } = convertObsidianToNoteHtml(body.trim(), basePath);

                // 画像ファイルの存在確認
                const imageStatus = images.map(img => ({
                    fileName: img.fileName,
                    localPath: img.localPath,
                    exists: fs.existsSync(img.localPath),
                    placeholder: img.placeholder
                }));

                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: true,
                                title,
                                html,
                                images: imageStatus,
                                imageCount: images.length,
                                missingImages: imageStatus.filter(i => !i.exists).map(i => i.fileName),
                                note: images.length > 0
                                    ? "画像はプレースホルダーとして挿入されています。Playwrightスクリプトで実際の画像に置換してください。"
                                    : "画像は含まれていません。"
                            }, null, 2)
                        }
                    ]
                };

            } catch (error: any) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                error: "変換に失敗しました",
                                message: error.message
                            }, null, 2)
                        }
                    ]
                };
            }
        }
    );

    /**
     * Obsidian記事をnoteに下書き投稿（画像はプレースホルダー）
     */
    server.tool(
        "prepare-obsidian-draft",
        "Obsidian記事をnote下書き用に準備（画像情報を含む）",
        {
            markdownPath: z.string().describe("Markdownファイルのパス"),
            imageBasePath: z.string().optional().describe("画像ファイルの基準パス"),
            tags: z.array(z.string()).optional().describe("タグ（最大10個）"),
        },
        async ({ markdownPath, imageBasePath, tags }) => {
            try {
                if (!fs.existsSync(markdownPath)) {
                    throw new Error(`ファイルが見つかりません: ${markdownPath}`);
                }

                const markdown = fs.readFileSync(markdownPath, 'utf-8');
                const basePath = imageBasePath || path.dirname(markdownPath);

                // タイトルを抽出
                const titleMatch = markdown.match(/^# (.+)$/m);
                const title = titleMatch ? titleMatch[1].trim() : '無題';

                // 本文を準備
                let body = markdown;
                if (titleMatch) {
                    body = markdown.replace(/^# .+\n?/, '');
                }
                body = body.replace(/^---\n[\s\S]*?\n---\n?/, '');

                // 変換実行
                const { html, images } = convertObsidianToNoteHtml(body.trim(), basePath);

                // 画像情報を収集
                const imageInfo = images.map(img => ({
                    fileName: img.fileName,
                    localPath: img.localPath,
                    exists: fs.existsSync(img.localPath),
                    fileSize: fs.existsSync(img.localPath)
                        ? fs.statSync(img.localPath).size
                        : 0
                }));

                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: true,
                                draft: {
                                    title,
                                    body: html,
                                    tags: tags || []
                                },
                                images: imageInfo,
                                imageCount: images.length,
                                allImagesExist: imageInfo.every(i => i.exists),
                                missingImages: imageInfo.filter(i => !i.exists).map(i => i.fileName),
                                nextStep: images.length > 0
                                    ? "1. post-draft-noteで下書きを作成\n2. playwright-insert-imagesで画像を挿入"
                                    : "post-draft-noteで下書きを作成してください"
                            }, null, 2)
                        }
                    ]
                };

            } catch (error: any) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                error: "準備に失敗しました",
                                message: error.message
                            }, null, 2)
                        }
                    ]
                };
            }
        }
    );
}
