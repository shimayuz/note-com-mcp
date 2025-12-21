/**
 * Note Export Orchestrator
 * Cascade/Windsurf内から直接呼び出し可能なOrchestration関数
 * 
 * 使用例（Cascade内）:
 * 1. Markdownファイルパスを指定
 * 2. orchestrateExport() を実行
 * 3. 画像がある場合は mcp6_upload-image でアップロード
 * 4. 返却されたデータでmcp6_post-draft-noteを呼び出し
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { convertMarkdownToNoteHtml } from './converter.js';
import { extractMetadata, type ArticleMetadata } from './extractor.js';
import { extractImages, type ImageInfo } from './image-processor.js';

export interface ExportResult {
  success: boolean;
  title: string;
  tags: string[];
  body: string;
  sourcePath: string;
  images: ImageInfo[];           // 検出された画像情報
  imageUrlMap: Map<string, string>;  // アップロード後のURL管理用
  error?: string;
}

/**
 * Vaultルートを推定（.obsidianフォルダを探す）
 */
function findVaultRoot(startPath: string): string {
  let current = dirname(startPath);
  for (let i = 0; i < 10; i++) {
    const obsidianPath = resolve(current, '.obsidian');
    try {
      readFileSync(resolve(obsidianPath, 'app.json'));
      return current;
    } catch {
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  // 見つからない場合はMarkdownファイルの2階層上を返す
  return resolve(dirname(startPath), '..');
}

/**
 * Markdownファイルからnote下書きエクスポート用データを生成
 * 画像も検出し、アップロード用の情報を含める
 */
export function orchestrateExport(markdownPath: string, vaultRoot?: string): ExportResult {
  try {
    const absolutePath = resolve(markdownPath);
    const content = readFileSync(absolutePath, 'utf-8');
    
    // Vaultルートを決定
    const vault = vaultRoot || findVaultRoot(absolutePath);
    
    // メタデータ抽出
    const metadata = extractMetadata(content);
    
    // タイトル決定
    const title = metadata.title || markdownPath.split('/').pop()?.replace('.md', '') || 'Untitled';
    
    // 画像を抽出
    const images = extractImages(content, absolutePath, vault);
    const imageUrlMap = new Map<string, string>();
    
    // 初期状態ではHTML変換（画像URLはまだない）
    const body = convertMarkdownToNoteHtml(content, {
      removeFirstH1: true,
      imageUrlMap,
    });
    
    return {
      success: true,
      title,
      tags: metadata.tags,
      body,
      sourcePath: absolutePath,
      images,
      imageUrlMap,
    };
  } catch (error) {
    return {
      success: false,
      title: '',
      tags: [],
      body: '',
      sourcePath: markdownPath,
      images: [],
      imageUrlMap: new Map(),
      error: (error as Error).message,
    };
  }
}

/**
 * 画像アップロード後にHTMLを再生成
 */
export function regenerateBodyWithImages(
  markdownPath: string,
  imageUrlMap: Map<string, string>,
  vaultRoot?: string
): string {
  const absolutePath = resolve(markdownPath);
  const content = readFileSync(absolutePath, 'utf-8');
  
  return convertMarkdownToNoteHtml(content, {
    removeFirstH1: true,
    imageUrlMap,
  });
}

/**
 * 複数ファイルの一括エクスポート準備
 */
export function orchestrateBatchExport(markdownPaths: string[]): ExportResult[] {
  return markdownPaths.map(path => orchestrateExport(path));
}

/**
 * HTMLが既に存在する場合の直接エクスポート準備
 */
export function prepareFromHtml(
  htmlPath: string,
  title: string,
  tags: string[] = []
): ExportResult {
  try {
    const absolutePath = resolve(htmlPath);
    const body = readFileSync(absolutePath, 'utf-8');
    
    return {
      success: true,
      title,
      tags,
      body,
      sourcePath: absolutePath,
      images: [],
      imageUrlMap: new Map(),
    };
  } catch (error) {
    return {
      success: false,
      title: '',
      tags: [],
      body: '',
      sourcePath: htmlPath,
      images: [],
      imageUrlMap: new Map(),
      error: (error as Error).message,
    };
  }
}
