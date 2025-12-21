/**
 * Note Exporter - Main Entry Point
 * Markdown → note.com下書きエクスポートのAuto Orchestration
 */

export { convertMarkdownToNoteHtml, type ConvertOptions } from './converter.js';
export { extractMetadata, extractTitle, extractTags, extractDescription, type ArticleMetadata } from './extractor.js';
export { orchestrateExport, orchestrateBatchExport, prepareFromHtml, regenerateBodyWithImages, type ExportResult } from './orchestrator.js';
export { 
  extractImages, 
  replaceImagesWithUrls, 
  processImagesInMarkdown, 
  prepareImageForNoteUpload,
  type ImageInfo,
  type ProcessedContent 
} from './image-processor.js';
