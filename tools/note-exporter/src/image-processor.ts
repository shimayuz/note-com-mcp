/**
 * Image Processor for Note Exporter
 * Obsidian画像をnote.comにアップロード可能な形式に処理
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname, basename, extname } from 'path';

export interface ImageInfo {
  originalSyntax: string;      // ![[image.png]] or ![alt](path)
  fileName: string;            // image.png
  localPath: string | null;    // 解決されたローカルパス
  base64?: string;             // Base64エンコードされた画像データ
  mimeType?: string;           // image/png, image/jpeg など
  uploadedUrl?: string;        // アップロード後のURL
}

export interface ProcessedContent {
  markdown: string;            // 画像参照を置換したMarkdown
  images: ImageInfo[];         // 検出された画像情報
}

/**
 * Obsidian Wikilink形式の画像を検出
 * ![[image.png]] or ![[image.png|alt text]]
 */
const OBSIDIAN_IMAGE_REGEX = /!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;

/**
 * 標準Markdown形式の画像を検出
 * ![alt](path)
 */
const MARKDOWN_IMAGE_REGEX = /!\[([^\]]*)\]\(([^)]+)\)/g;

/**
 * MIMEタイプを拡張子から取得
 */
function getMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.bmp': 'image/bmp',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Obsidian Vault内で画像ファイルを探索
 */
function findImageInVault(fileName: string, vaultRoot: string, currentDir: string): string | null {
  // 1. カレントディレクトリから探索
  const currentPath = join(currentDir, fileName);
  if (existsSync(currentPath)) {
    return currentPath;
  }

  // 2. Vaultルートから探索
  const rootPath = join(vaultRoot, fileName);
  if (existsSync(rootPath)) {
    return rootPath;
  }

  // 3. 一般的な画像フォルダを探索
  const commonDirs = ['attachments', 'images', 'assets', 'media', ''];
  for (const dir of commonDirs) {
    const searchPath = join(vaultRoot, dir, fileName);
    if (existsSync(searchPath)) {
      return searchPath;
    }
  }

  return null;
}

/**
 * 画像ファイルをBase64エンコード
 */
function encodeImageToBase64(filePath: string): string {
  const buffer = readFileSync(filePath);
  return buffer.toString('base64');
}

/**
 * Markdownから画像を抽出し、情報を収集
 */
export function extractImages(
  markdown: string,
  markdownFilePath: string,
  vaultRoot: string
): ImageInfo[] {
  const images: ImageInfo[] = [];
  const currentDir = dirname(markdownFilePath);

  // Obsidian Wikilink形式を検出
  let match;
  while ((match = OBSIDIAN_IMAGE_REGEX.exec(markdown)) !== null) {
    const fileName = match[1].trim();
    const localPath = findImageInVault(fileName, vaultRoot, currentDir);
    
    const imageInfo: ImageInfo = {
      originalSyntax: match[0],
      fileName,
      localPath,
    };

    if (localPath) {
      imageInfo.base64 = encodeImageToBase64(localPath);
      imageInfo.mimeType = getMimeType(localPath);
    }

    images.push(imageInfo);
  }

  // 標準Markdown形式を検出（ローカルパスのみ）
  MARKDOWN_IMAGE_REGEX.lastIndex = 0;
  while ((match = MARKDOWN_IMAGE_REGEX.exec(markdown)) !== null) {
    const altText = match[1];
    const imagePath = match[2];

    // URLの場合はスキップ
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
      continue;
    }

    const fileName = basename(imagePath);
    const localPath = findImageInVault(imagePath, vaultRoot, currentDir) 
                   || findImageInVault(fileName, vaultRoot, currentDir);

    const imageInfo: ImageInfo = {
      originalSyntax: match[0],
      fileName,
      localPath,
    };

    if (localPath) {
      imageInfo.base64 = encodeImageToBase64(localPath);
      imageInfo.mimeType = getMimeType(localPath);
    }

    images.push(imageInfo);
  }

  return images;
}

/**
 * アップロード済みURLでMarkdown内の画像参照を置換
 */
export function replaceImagesWithUrls(
  markdown: string,
  images: ImageInfo[]
): string {
  let result = markdown;

  for (const image of images) {
    if (image.uploadedUrl) {
      // note.comのimg形式に置換
      const imgTag = `<figure><img src="${image.uploadedUrl}" alt="${image.fileName}"></figure>`;
      result = result.replace(image.originalSyntax, imgTag);
    } else if (image.localPath === null) {
      // 画像が見つからない場合はコメントとして残す
      result = result.replace(
        image.originalSyntax,
        `<!-- 画像が見つかりません: ${image.fileName} -->`
      );
    }
  }

  return result;
}

/**
 * 画像処理の完全なフロー（アップロードURLは外部から設定）
 */
export function processImagesInMarkdown(
  markdown: string,
  markdownFilePath: string,
  vaultRoot: string
): ProcessedContent {
  const images = extractImages(markdown, markdownFilePath, vaultRoot);
  
  return {
    markdown,
    images,
  };
}

/**
 * note MCP用のアップロードデータを生成
 */
export function prepareImageForNoteUpload(image: ImageInfo): {
  imagePath?: string;
  imageBase64?: string;
} | null {
  if (!image.localPath && !image.base64) {
    return null;
  }

  // ローカルパスがある場合はそれを使用
  if (image.localPath) {
    return { imagePath: image.localPath };
  }

  // Base64がある場合はそれを使用
  if (image.base64) {
    return { imageBase64: image.base64 };
  }

  return null;
}
