import { Page } from "playwright";
import path from "path";

/**
 * Markdownの要素タイプ
 */
export type MarkdownElementType =
  | "heading2" // ## 見出し
  | "heading3" // ### 小見出し
  | "paragraph" // 通常のテキスト
  | "bulletList" // - 箇条書き
  | "numberedList" // 1. 番号付きリスト
  | "quote" // > 引用
  | "code" // ```コードブロック```
  | "image" // ![alt](path) 画像
  | "hr"; // --- 区切り線

/**
 * パースされたMarkdown要素
 */
export interface MarkdownElement {
  type: MarkdownElementType;
  content: string;
  language?: string; // コードブロックの言語
  imagePath?: string; // 画像のパス
  caption?: string; // 画像のキャプション
}

/**
 * MarkdownをnoteエディタのUI操作用に解析
 */
export function parseMarkdown(markdown: string): MarkdownElement[] {
  const elements: MarkdownElement[] = [];
  const lines = markdown.split("\n");

  let i = 0;
  let paragraphBuffer: string[] = [];

  const flushParagraph = () => {
    if (paragraphBuffer.length > 0) {
      elements.push({ type: "paragraph", content: paragraphBuffer.join(" ") });
      paragraphBuffer = [];
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    // 空行は段落区切り（\n\n = 新しい段落）
    if (line.trim() === "") {
      flushParagraph();
      i++;
      continue;
    }

    // ai-summaryタグブロックの処理
    // <!-- ai-summary:start id="img1" ... -->
    // ![[image.png]]
    // *キャプションテキスト*
    // <!-- ai-summary:end id="img1" -->
    const aiSummaryStartMatch = line.match(/^<!--\s*ai-summary:start\s+id="([^"]+)"/);
    if (aiSummaryStartMatch) {
      flushParagraph();
      const blockId = aiSummaryStartMatch[1];
      i++;

      let imagePath: string | null = null;
      let caption: string | null = null;

      // ai-summary:end まで読み進める
      while (i < lines.length && !lines[i].match(/^<!--\s*ai-summary:end/)) {
        const currentLine = lines[i].trim();

        // 画像行を検出
        const obsidianImg = currentLine.match(/^!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]$/);
        const mdImg = currentLine.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);

        if (obsidianImg) {
          imagePath = obsidianImg[1];
        } else if (mdImg) {
          imagePath = mdImg[2];
        }

        // キャプション行を検出（*で囲まれたテキスト）
        const captionMatch = currentLine.match(/^\*(.+)\*$/);
        if (captionMatch) {
          caption = captionMatch[1].trim();
        }

        i++;
      }

      // ai-summary:end 行をスキップ
      if (i < lines.length && lines[i].match(/^<!--\s*ai-summary:end/)) {
        i++;
      }

      // 画像要素を追加
      if (imagePath) {
        elements.push({
          type: "image",
          content: imagePath,
          imagePath: imagePath,
          caption: caption || undefined,
        });
      }
      continue;
    }

    // コードブロック
    if (line.startsWith("```")) {
      flushParagraph();
      const language = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push({
        type: "code",
        content: codeLines.join("\n"),
        language,
      });
      i++;
      continue;
    }

    // 見出し
    if (line.startsWith("## ")) {
      flushParagraph();
      elements.push({ type: "heading2", content: line.slice(3).trim() });
      i++;
      continue;
    }
    if (line.startsWith("### ")) {
      flushParagraph();
      elements.push({ type: "heading3", content: line.slice(4).trim() });
      i++;
      continue;
    }

    // 区切り線
    if (line.match(/^---+$/)) {
      flushParagraph();
      elements.push({ type: "hr", content: "" });
      i++;
      continue;
    }

    // 引用（複数行対応、スペースなしの形式も対応）
    // "> text" または ">text" の両方に対応
    if (line.match(/^>\s?/)) {
      flushParagraph();
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].match(/^>\s?/)) {
        // ">" の後のスペースを除去してテキストを取得
        quoteLines.push(lines[i].replace(/^>\s?/, "").trim());
        i++;
      }
      // 空行のみの引用は除外
      const filteredLines = quoteLines.filter((l) => l.length > 0);
      if (filteredLines.length > 0) {
        elements.push({ type: "quote", content: filteredLines.join("\n") });
      }
      continue;
    }

    // 箇条書き
    if (line.match(/^[-*] /)) {
      flushParagraph();
      const listItems: string[] = [];
      while (i < lines.length && lines[i].match(/^[-*] /)) {
        listItems.push(lines[i].replace(/^[-*] /, "").trim());
        i++;
      }
      elements.push({ type: "bulletList", content: listItems.join("\n") });
      continue;
    }

    // 番号付きリスト
    if (line.match(/^\d+\. /)) {
      flushParagraph();
      const listItems: string[] = [];
      while (i < lines.length && lines[i].match(/^\d+\. /)) {
        listItems.push(lines[i].replace(/^\d+\. /, "").trim());
        i++;
      }
      elements.push({ type: "numberedList", content: listItems.join("\n") });
      continue;
    }

    // 画像 ![[filename]] または ![alt](path)
    const obsidianImageMatch = line.match(/^!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]$/);
    const mdImageMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);

    if (obsidianImageMatch) {
      flushParagraph();
      const imageElement: MarkdownElement = {
        type: "image",
        content: obsidianImageMatch[1],
        imagePath: obsidianImageMatch[1],
      };
      elements.push(imageElement);
      i++;

      // 画像直後の空行を1行だけスキップ
      if (i < lines.length && lines[i].trim() === "") {
        i++;
      }

      // 次の行がキャプションかチェック
      if (
        i < lines.length &&
        lines[i].trim() &&
        !lines[i].match(/^#{1,6}\s/) &&
        !lines[i].match(/^[-*]\s/) &&
        !lines[i].match(/^\d+\.\s/) &&
        !lines[i].match(/^>\s/) &&
        !lines[i].match(/^```/) &&
        !lines[i].match(/^---+$/) &&
        !lines[i].match(/^!\[/)
      ) {
        // 画像直後のテキスト行をキャプションとして扱う
        imageElement.caption = lines[i].trim();
        i++;
      }
      continue;
    }

    if (mdImageMatch) {
      flushParagraph();
      const imageElement: MarkdownElement = {
        type: "image",
        content: mdImageMatch[1],
        imagePath: mdImageMatch[2],
        caption:
          mdImageMatch[1] && mdImageMatch[1] !== path.basename(mdImageMatch[2])
            ? mdImageMatch[1]
            : undefined,
      };
      elements.push(imageElement);
      i++;

      // 画像直後の空行を1行だけスキップ
      if (i < lines.length && lines[i].trim() === "") {
        i++;
      }

      // 次の行がキャプションかチェック（altテキストがない場合）
      if (
        !mdImageMatch[1] &&
        i < lines.length &&
        lines[i].trim() &&
        !lines[i].match(/^#{1,6}\s/) &&
        !lines[i].match(/^[-*]\s/) &&
        !lines[i].match(/^\d+\.\s/) &&
        !lines[i].match(/^>\s/) &&
        !lines[i].match(/^```/) &&
        !lines[i].match(/^---+$/) &&
        !lines[i].match(/^!\[/)
      ) {
        // 画像直後のテキスト行をキャプションとして扱う
        imageElement.caption = lines[i].trim();
        i++;
      }
      continue;
    }

    // 通常のテキスト（段落バッファに追加、空行で区切られるまで同一段落）
    paragraphBuffer.push(line.trim());
    i++;
  }

  flushParagraph();

  return elements;
}

/**
 * noteエディタにMarkdown要素を入力
 */
export async function formatToNoteEditor(
  page: Page,
  elements: MarkdownElement[],
  imageBasePath: string,
  insertImageFn: (page: Page, bodyBox: any, imagePath: string) => Promise<void>
): Promise<void> {
  const bodyBox = page.locator('div[contenteditable="true"][role="textbox"]').first();
  await bodyBox.waitFor({ state: "visible" });
  await bodyBox.click();

  for (let i = 0; i < elements.length; i++) {
    const element = elements[i];

    switch (element.type) {
      case "heading2":
        await insertHeading(page, element.content, "h2");
        break;

      case "heading3":
        await insertHeading(page, element.content, "h3");
        break;

      case "paragraph":
        await page.keyboard.type(element.content);
        await page.keyboard.press("Enter");
        break;

      case "bulletList":
        await insertBulletList(page, element.content.split("\n"));
        break;

      case "numberedList":
        await insertNumberedList(page, element.content.split("\n"));
        break;

      case "quote":
        await insertQuote(page, element.content);
        break;

      case "code":
        await insertCodeBlock(page, element.content, element.language);
        break;

      case "image":
        if (element.imagePath) {
          const fullPath = element.imagePath.startsWith("/")
            ? element.imagePath
            : `${imageBasePath}/${element.imagePath}`;
          await insertImageFn(page, bodyBox, fullPath);

          // キャプションがあれば挿入
          if (element.caption) {
            await page.waitForTimeout(1500);

            // 「キャプションを入力」テキストをクリック
            try {
              const captionText = page.locator("text=キャプションを入力").last();
              await captionText.waitFor({ state: "visible", timeout: 5000 });
              await captionText.click();
              await page.waitForTimeout(500);
              await page.keyboard.type(element.caption);
              await page.keyboard.press("Escape");
              await page.waitForTimeout(300);
            } catch (e) {
              // フォールバック: 本文の次の行に入力
              console.log("キャプション入力欄が見つかりません、本文に入力します");
            }
          }
        }
        break;

      case "hr":
        await insertHorizontalRule(page);
        break;
    }

    // 要素間に少し待機
    await page.waitForTimeout(200);
  }
}

/**
 * 見出しを挿入（「+」メニューから）
 */
async function insertHeading(page: Page, text: string, level: "h2" | "h3"): Promise<void> {
  // 「+」ボタンをクリック
  await clickPlusButton(page);

  // メニューから見出しを選択
  const menuText = level === "h2" ? "大見出し" : "小見出し";
  const menuItem = page.locator(`[role="menuitem"]:has-text("${menuText}")`).first();

  try {
    await menuItem.waitFor({ state: "visible", timeout: 3000 });
    await menuItem.click();
    await page.waitForTimeout(500);
  } catch (e) {
    // メニューが開かない場合はテキストとして入力
    await page.keyboard.type(level === "h2" ? `## ${text}` : `### ${text}`);
    await page.keyboard.press("Enter");
    return;
  }

  // テキストを入力
  await page.keyboard.type(text);
  await page.keyboard.press("Enter");
}

/**
 * 箇条書きリストを挿入
 */
async function insertBulletList(page: Page, items: string[]): Promise<void> {
  // 「+」ボタンをクリック
  await clickPlusButton(page);

  // メニューから箇条書きを選択
  const menuItem = page.locator('[role="menuitem"]:has-text("箇条書きリスト")').first();

  try {
    await menuItem.waitFor({ state: "visible", timeout: 3000 });
    await menuItem.click();
    await page.waitForTimeout(500);
  } catch (e) {
    // フォールバック: テキストとして入力
    for (const item of items) {
      await page.keyboard.type(`- ${item}`);
      await page.keyboard.press("Enter");
    }
    return;
  }

  // 各項目を入力
  for (let i = 0; i < items.length; i++) {
    await page.keyboard.type(items[i]);
    if (i < items.length - 1) {
      await page.keyboard.press("Enter");
    }
  }

  // リストを終了
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
}

/**
 * 番号付きリストを挿入
 */
async function insertNumberedList(page: Page, items: string[]): Promise<void> {
  // 「+」ボタンをクリック
  await clickPlusButton(page);

  // メニューから番号付きリストを選択
  const menuItem = page.locator('[role="menuitem"]:has-text("番号付きリスト")').first();

  try {
    await menuItem.waitFor({ state: "visible", timeout: 3000 });
    await menuItem.click();
    await page.waitForTimeout(500);
  } catch (e) {
    // フォールバック
    for (let i = 0; i < items.length; i++) {
      await page.keyboard.type(`${i + 1}. ${items[i]}`);
      await page.keyboard.press("Enter");
    }
    return;
  }

  // 各項目を入力
  for (let i = 0; i < items.length; i++) {
    await page.keyboard.type(items[i]);
    if (i < items.length - 1) {
      await page.keyboard.press("Enter");
    }
  }

  // リストを終了
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
}

/**
 * 引用を挿入
 */
async function insertQuote(page: Page, text: string): Promise<void> {
  // 「+」ボタンをクリック
  await clickPlusButton(page);

  // メニューから引用を選択
  const menuItem = page.locator('[role="menuitem"]:has-text("引用")').first();

  try {
    await menuItem.waitFor({ state: "visible", timeout: 3000 });
    await menuItem.click();
    await page.waitForTimeout(500);
  } catch (e) {
    // フォールバック
    await page.keyboard.type(`> ${text}`);
    await page.keyboard.press("Enter");
    return;
  }

  // 複数行の引用に対応
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    await page.keyboard.type(lines[i]);
    if (i < lines.length - 1) {
      // 引用ブロック内での改行は Shift+Enter
      await page.keyboard.press("Shift+Enter");
    }
  }
  // 引用ブロックを終了
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
}

/**
 * コードブロックを挿入
 */
async function insertCodeBlock(page: Page, code: string, language?: string): Promise<void> {
  // 「+」ボタンをクリック
  await clickPlusButton(page);

  // メニューからコードを選択
  const menuItem = page.locator('[role="menuitem"]:has-text("コード")').first();

  try {
    await menuItem.waitFor({ state: "visible", timeout: 3000 });
    await menuItem.click();
    await page.waitForTimeout(500);
  } catch (e) {
    // フォールバック
    await page.keyboard.type("```" + (language || ""));
    await page.keyboard.press("Enter");
    await page.keyboard.type(code);
    await page.keyboard.press("Enter");
    await page.keyboard.type("```");
    await page.keyboard.press("Enter");
    return;
  }

  await page.keyboard.type(code);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
}

/**
 * 区切り線を挿入
 */
async function insertHorizontalRule(page: Page): Promise<void> {
  // 「+」ボタンをクリック
  await clickPlusButton(page);

  // メニューから区切り線を選択
  const menuItem = page.locator('[role="menuitem"]:has-text("区切り線")').first();

  try {
    await menuItem.waitFor({ state: "visible", timeout: 3000 });
    await menuItem.click();
    await page.waitForTimeout(500);
  } catch (e) {
    // フォールバック
    await page.keyboard.type("---");
    await page.keyboard.press("Enter");
  }
}

/**
 * 「+」ボタンをクリック
 */
async function clickPlusButton(page: Page): Promise<void> {
  const bodyBox = page.locator('div[contenteditable="true"][role="textbox"]').first();
  const bodyBoxHandle = await bodyBox.boundingBox();

  if (!bodyBoxHandle) {
    throw new Error("本文エリアが見つかりません");
  }

  // 「+」ボタンを探す
  const allBtns = await page.$$("button");
  let clicked = false;

  for (const btn of allBtns) {
    const box = await btn.boundingBox();
    if (!box) continue;

    if (
      box.x > bodyBoxHandle.x - 100 &&
      box.x < bodyBoxHandle.x &&
      box.y > bodyBoxHandle.y &&
      box.y < bodyBoxHandle.y + 300 &&
      box.width < 60
    ) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(200);
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      clicked = true;
      await page.waitForTimeout(1000);
      break;
    }
  }

  // フォールバック
  if (!clicked) {
    const plusX = bodyBoxHandle.x - 30;
    const plusY = bodyBoxHandle.y + 50;
    await page.mouse.click(plusX, plusY);
    await page.waitForTimeout(1000);
  }
}

/**
 * Markdownからタイトルを抽出
 */
export function extractTitle(markdown: string): string {
  const match = markdown.match(/^# (.+)$/m);
  return match ? match[1].trim() : "無題";
}

/**
 * Markdownからタイトル行を除去
 */
export function removeTitle(markdown: string): string {
  return markdown.replace(/^# .+\n?/, "");
}

/**
 * Frontmatterを除去
 */
export function removeFrontmatter(markdown: string): string {
  return markdown.replace(/^---\n[\s\S]*?\n---\n?/, "");
}
