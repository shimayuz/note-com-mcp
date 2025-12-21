#!/usr/bin/env node
/**
 * Note Exporter CLI
 * Markdown → note.com下書きエクスポートのAuto Orchestration
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { basename, dirname, join, resolve } from 'path';
import { glob } from 'glob';
import { convertMarkdownToNoteHtml } from './converter.js';
import { extractMetadata } from './extractor.js';

const program = new Command();

interface ExportOptions {
  output?: string;
  draft?: boolean;
  tags?: string;
  dryRun?: boolean;
  verbose?: boolean;
}

/**
 * 単一ファイルをHTMLに変換
 */
async function convertFile(
  inputPath: string,
  options: ExportOptions
): Promise<{ html: string; title: string; tags: string[] }> {
  const absolutePath = resolve(inputPath);
  
  if (!existsSync(absolutePath)) {
    throw new Error(`ファイルが見つかりません: ${absolutePath}`);
  }

  const content = readFileSync(absolutePath, 'utf-8');
  const metadata = extractMetadata(content);
  
  // タイトル決定（メタデータ > ファイル名）
  const title = metadata.title || basename(inputPath, '.md');
  
  // タグ決定（CLI引数 > メタデータ）
  let tags = metadata.tags;
  if (options.tags) {
    tags = options.tags.split(',').map(t => t.trim());
  }

  // HTML変換
  const html = convertMarkdownToNoteHtml(content, {
    removeFirstH1: true, // タイトルは別途使用するため除去
  });

  return { html, title, tags };
}

/**
 * HTMLファイルとして出力
 */
function outputHtmlFile(
  inputPath: string,
  html: string,
  title: string,
  outputDir?: string
): string {
  const inputDir = dirname(inputPath);
  const baseName = basename(inputPath, '.md');
  const outputPath = outputDir
    ? join(outputDir, `${baseName}_note.html`)
    : join(inputDir, `${baseName}_note.html`);

  // タイトルをh1として先頭に追加
  const fullHtml = `<h1>${title}</h1>\n\n${html}`;
  writeFileSync(outputPath, fullHtml, 'utf-8');
  
  return outputPath;
}

/**
 * note MCPへの下書きエクスポート情報を出力
 */
function outputMcpCommand(title: string, html: string, tags: string[]): void {
  console.log(chalk.cyan('\n📝 note MCP下書きエクスポート用データ:'));
  console.log(chalk.gray('─'.repeat(50)));
  console.log(chalk.yellow('タイトル:'), title);
  console.log(chalk.yellow('タグ:'), tags.join(', ') || '(なし)');
  console.log(chalk.yellow('本文プレビュー:'));
  console.log(chalk.gray(html.slice(0, 300) + (html.length > 300 ? '...' : '')));
  console.log(chalk.gray('─'.repeat(50)));
  
  console.log(chalk.green('\n✅ 以下のMCPツールを使用して下書きを作成できます:'));
  console.log(chalk.white('  mcp6_post-draft-note'));
  console.log(chalk.gray(`    title: "${title}"`));
  console.log(chalk.gray(`    tags: ${JSON.stringify(tags)}`));
  console.log(chalk.gray(`    body: <HTMLコンテンツ>`));
}

// CLIコマンド定義
program
  .name('note-export')
  .description('Markdown記事をnote.com用HTMLに変換し、下書きエクスポートを支援')
  .version('1.0.0');

// convertコマンド: Markdown → HTML変換
program
  .command('convert <input>')
  .description('MarkdownファイルをNote.com用HTMLに変換')
  .option('-o, --output <dir>', '出力ディレクトリ')
  .option('-t, --tags <tags>', 'タグ（カンマ区切り）')
  .option('-v, --verbose', '詳細出力')
  .action(async (input: string, options: ExportOptions) => {
    try {
      console.log(chalk.blue('🔄 変換中...'), input);
      
      const { html, title, tags } = await convertFile(input, options);
      const outputPath = outputHtmlFile(input, html, title, options.output);
      
      console.log(chalk.green('✅ 変換完了:'), outputPath);
      
      if (options.verbose) {
        outputMcpCommand(title, html, tags);
      }
    } catch (error) {
      console.error(chalk.red('❌ エラー:'), (error as Error).message);
      process.exit(1);
    }
  });

// prepareコマンド: 下書きエクスポート準備（MCP用データ生成）
program
  .command('prepare <input>')
  .description('note MCP下書きエクスポート用のデータを準備')
  .option('-t, --tags <tags>', 'タグ（カンマ区切り）')
  .option('--dry-run', '実際には実行せず、データのみ表示')
  .action(async (input: string, options: ExportOptions) => {
    try {
      console.log(chalk.blue('📋 下書きデータ準備中...'), input);
      
      const { html, title, tags } = await convertFile(input, options);
      
      outputMcpCommand(title, html, tags);
      
      // JSON形式でも出力（プログラム連携用）
      const exportData = {
        title,
        tags,
        body: html,
        source: resolve(input),
      };
      
      const jsonPath = resolve(input).replace('.md', '_export.json');
      writeFileSync(jsonPath, JSON.stringify(exportData, null, 2), 'utf-8');
      console.log(chalk.green('\n📄 エクスポートデータ保存:'), jsonPath);
      
    } catch (error) {
      console.error(chalk.red('❌ エラー:'), (error as Error).message);
      process.exit(1);
    }
  });

// batchコマンド: 複数ファイル一括変換
program
  .command('batch <pattern>')
  .description('複数のMarkdownファイルを一括変換')
  .option('-o, --output <dir>', '出力ディレクトリ')
  .action(async (pattern: string, options: ExportOptions) => {
    try {
      const files = await glob(pattern);
      
      if (files.length === 0) {
        console.log(chalk.yellow('⚠️ 対象ファイルが見つかりません'));
        return;
      }
      
      console.log(chalk.blue(`🔄 ${files.length}件のファイルを変換中...`));
      
      for (const file of files) {
        try {
          const { html, title, tags } = await convertFile(file, options);
          const outputPath = outputHtmlFile(file, html, title, options.output);
          console.log(chalk.green('  ✅'), basename(file), '→', basename(outputPath));
        } catch (error) {
          console.log(chalk.red('  ❌'), basename(file), '-', (error as Error).message);
        }
      }
      
      console.log(chalk.green('\n✅ 一括変換完了'));
    } catch (error) {
      console.error(chalk.red('❌ エラー:'), (error as Error).message);
      process.exit(1);
    }
  });

program.parse();
