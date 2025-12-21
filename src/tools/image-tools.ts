import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { noteApiRequest } from "../utils/api-client.js";
import { hasAuth } from "../utils/auth.js";
import fs from "fs";
import path from "path";
import { chromium } from "playwright";

/**
 * 画像関連のツールを登録する
 * @param server MCPサーバーインスタンス
 */
export function registerImageTools(server: McpServer): void {
    /**
     * 画像をアップロードするツール
     * 注意: このツールはnote.comのS3に画像をアップロードしますが、
     * 本文中に画像を挿入するには publish-from-obsidian または insert-images-to-note ツールを使用してください。
     * note.comのAPIは本文中の<img>タグをサニタイズするため、APIだけでは本文画像挿入ができません。
     */
    server.tool(
        "upload-image",
        "note.comに画像をアップロード（アイキャッチ画像用。本文画像は publish-from-obsidian を使用）",
        {
            imagePath: z.string().optional().describe("アップロードする画像ファイルのパス"),
            imageUrl: z.string().optional().describe("アップロードする画像のURL（imagePathの代わりに使用可能）"),
            imageBase64: z.string().optional().describe("Base64エンコードされた画像データ（imagePathの代わりに使用可能）"),
        },
        async ({ imagePath, imageUrl, imageBase64 }) => {
            // 認証チェック
            if (!hasAuth()) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                error: "認証が必要です",
                                message: "画像アップロード機能を使用するには、.envファイルに認証情報を設定してください"
                            }, null, 2)
                        }
                    ]
                };
            }

            try {
                let imageBuffer: Buffer;
                let fileName: string;
                let mimeType: string;

                // 最大ファイルサイズ（10MB）
                const MAX_FILE_SIZE = 10 * 1024 * 1024;

                // 画像データの取得方法を判定
                if (imagePath) {
                    // ファイルパスから画像を読み込み
                    if (!fs.existsSync(imagePath)) {
                        throw new Error(`画像ファイルが見つかりません: ${imagePath}`);
                    }

                    // ファイルサイズをチェック
                    const stats = fs.statSync(imagePath);
                    if (stats.size > MAX_FILE_SIZE) {
                        throw new Error(`画像ファイルが大きすぎます: ${(stats.size / 1024 / 1024).toFixed(2)}MB（最大10MB）`);
                    }

                    imageBuffer = fs.readFileSync(imagePath);
                    fileName = path.basename(imagePath);

                    // MIMEタイプを拡張子から判定
                    const ext = path.extname(imagePath).toLowerCase();
                    const mimeTypes: { [key: string]: string } = {
                        '.jpg': 'image/jpeg',
                        '.jpeg': 'image/jpeg',
                        '.png': 'image/png',
                        '.gif': 'image/gif',
                        '.webp': 'image/webp',
                        '.svg': 'image/svg+xml'
                    };
                    mimeType = mimeTypes[ext];

                    if (!mimeType) {
                        throw new Error(`サポートされていない画像形式です: ${ext}（対応形式: jpg, png, gif, webp, svg）`);
                    }

                } else if (imageUrl) {
                    // URLから画像をダウンロード
                    const response = await fetch(imageUrl);
                    if (!response.ok) {
                        throw new Error(`画像のダウンロードに失敗しました: ${response.statusText}`);
                    }

                    const arrayBuffer = await response.arrayBuffer();
                    imageBuffer = Buffer.from(arrayBuffer);

                    // ファイルサイズをチェック
                    if (imageBuffer.length > MAX_FILE_SIZE) {
                        throw new Error(`画像ファイルが大きすぎます: ${(imageBuffer.length / 1024 / 1024).toFixed(2)}MB（最大10MB）`);
                    }

                    // URLからファイル名を取得
                    const urlPath = new URL(imageUrl).pathname;
                    fileName = path.basename(urlPath) || 'image.jpg';

                    // Content-Typeから判定
                    const contentType = response.headers.get('content-type');
                    if (contentType && contentType.startsWith('image/')) {
                        mimeType = contentType;
                    } else {
                        throw new Error(`URLから取得したファイルが画像ではありません: ${contentType}`);
                    }

                } else if (imageBase64) {
                    // Base64データから画像を復元
                    imageBuffer = Buffer.from(imageBase64, 'base64');

                    // ファイルサイズをチェック
                    if (imageBuffer.length > MAX_FILE_SIZE) {
                        throw new Error(`画像ファイルが大きすぎます: ${(imageBuffer.length / 1024 / 1024).toFixed(2)}MB（最大10MB）`);
                    }

                    fileName = 'image.jpg';
                    mimeType = 'image/jpeg';

                } else {
                    throw new Error('imagePath、imageUrl、またはimageBase64のいずれかを指定してください');
                }

                // Step 1: Presigned URLを取得（filenameのみ送信）
                const boundary1 = `----WebKitFormBoundary${Math.random().toString(36).substring(2)}`;
                const presignFormParts: Buffer[] = [];

                // ファイル名パートのみ（ブラウザと同じ形式）
                presignFormParts.push(Buffer.from(
                    `--${boundary1}\r\n` +
                    `Content-Disposition: form-data; name="filename"\r\n\r\n` +
                    `${fileName}\r\n`
                ));

                // 終了境界
                presignFormParts.push(Buffer.from(`--${boundary1}--\r\n`));

                const presignFormData = Buffer.concat(presignFormParts);

                // Presigned URL APIを呼び出し（API_BASE_URLが/apiを含むため、/v3から開始）
                const presignResponse = await noteApiRequest(
                    '/v3/images/upload/presigned_post',
                    'POST',
                    presignFormData,
                    true,
                    {
                        'Content-Type': `multipart/form-data; boundary=${boundary1}`,
                        'Content-Length': presignFormData.length.toString(),
                        'X-Requested-With': 'XMLHttpRequest',
                        'Referer': 'https://editor.note.com/'
                    }
                );

                if (!presignResponse.data || !presignResponse.data.post) {
                    console.error("Presigned URLの取得に失敗:", JSON.stringify(presignResponse));
                    throw new Error("Presigned URLの取得に失敗しました");
                }

                const { url: finalImageUrl, action: s3Url, post: s3Params } = presignResponse.data;

                // Step 2: S3に直接アップロード
                const boundary2 = `----WebKitFormBoundary${Math.random().toString(36).substring(2)}`;
                const s3FormParts: Buffer[] = [];

                // S3パラメータを追加（順序が重要）
                const paramOrder = ['key', 'acl', 'Expires', 'policy', 'x-amz-credential', 'x-amz-algorithm', 'x-amz-date', 'x-amz-signature'];
                for (const key of paramOrder) {
                    if (s3Params[key]) {
                        s3FormParts.push(Buffer.from(
                            `--${boundary2}\r\n` +
                            `Content-Disposition: form-data; name="${key}"\r\n\r\n` +
                            `${s3Params[key]}\r\n`
                        ));
                    }
                }

                // ファイルパート（最後に追加）
                s3FormParts.push(Buffer.from(
                    `--${boundary2}\r\n` +
                    `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
                    `Content-Type: ${mimeType}\r\n\r\n`
                ));
                s3FormParts.push(imageBuffer);
                s3FormParts.push(Buffer.from('\r\n'));

                // 終了境界
                s3FormParts.push(Buffer.from(`--${boundary2}--\r\n`));

                const s3FormData = Buffer.concat(s3FormParts);

                // S3にアップロード
                const s3Response = await fetch(s3Url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': `multipart/form-data; boundary=${boundary2}`,
                        'Content-Length': s3FormData.length.toString()
                    },
                    body: s3FormData
                });

                if (!s3Response.ok && s3Response.status !== 204) {
                    const errorText = await s3Response.text();
                    console.error("S3アップロードエラー:", s3Response.status, errorText);
                    throw new Error(`S3へのアップロードに失敗しました: ${s3Response.status}`);
                }

                const uploadedImageUrl = finalImageUrl;

                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: true,
                                message: "画像のアップロードに成功しました",
                                imageUrl: uploadedImageUrl,
                                fileName: fileName,
                                fileSize: imageBuffer.length,
                                fileSizeMB: (imageBuffer.length / 1024 / 1024).toFixed(2),
                                mimeType: mimeType,
                                // デバッグ用に元のレスポンスも含める
                                _debug: {
                                    presignResponse: presignResponse
                                }
                            }, null, 2)
                        }
                    ]
                };

            } catch (error: any) {
                console.error("画像アップロードエラー:", error);
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                error: "画像アップロードに失敗しました",
                                message: error.message,
                                details: error.toString()
                            }, null, 2)
                        }
                    ]
                };
            }
        }
    );

    /**
     * 複数の画像を一括アップロードするツール
     */
    server.tool(
        "upload-images-batch",
        "note.comに複数の画像を一括アップロード",
        {
            imagePaths: z.array(z.string()).describe("アップロードする画像ファイルのパスの配列"),
        },
        async ({ imagePaths }) => {
            // 認証チェック
            if (!hasAuth()) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                error: "認証が必要です",
                                message: "画像アップロード機能を使用するには、.envファイルに認証情報を設定してください"
                            }, null, 2)
                        }
                    ]
                };
            }

            const results = [];
            const errors = [];
            const MAX_FILE_SIZE = 10 * 1024 * 1024;

            for (const imagePath of imagePaths) {
                try {
                    if (!fs.existsSync(imagePath)) {
                        errors.push({
                            path: imagePath,
                            error: "ファイルが見つかりません"
                        });
                        continue;
                    }

                    // ファイルサイズをチェック
                    const stats = fs.statSync(imagePath);
                    if (stats.size > MAX_FILE_SIZE) {
                        errors.push({
                            path: imagePath,
                            error: `ファイルが大きすぎます: ${(stats.size / 1024 / 1024).toFixed(2)}MB（最大10MB）`
                        });
                        continue;
                    }

                    const imageBuffer = fs.readFileSync(imagePath);
                    const fileName = path.basename(imagePath);

                    const ext = path.extname(imagePath).toLowerCase();
                    const mimeTypes: { [key: string]: string } = {
                        '.jpg': 'image/jpeg',
                        '.jpeg': 'image/jpeg',
                        '.png': 'image/png',
                        '.gif': 'image/gif',
                        '.webp': 'image/webp',
                        '.svg': 'image/svg+xml'
                    };
                    const mimeType = mimeTypes[ext];

                    if (!mimeType) {
                        errors.push({
                            path: imagePath,
                            error: `サポートされていない画像形式: ${ext}`
                        });
                        continue;
                    }

                    // Step 1: Presigned URLを取得（filenameのみ送信）
                    const boundary1 = `----WebKitFormBoundary${Math.random().toString(36).substring(2)}`;
                    const presignFormParts: Buffer[] = [];

                    // ファイル名パートのみ（ブラウザと同じ形式）
                    presignFormParts.push(Buffer.from(
                        `--${boundary1}\r\n` +
                        `Content-Disposition: form-data; name="filename"\r\n\r\n` +
                        `${fileName}\r\n`
                    ));
                    presignFormParts.push(Buffer.from(`--${boundary1}--\r\n`));

                    const presignFormData = Buffer.concat(presignFormParts);

                    const presignResponse = await noteApiRequest(
                        '/v3/images/upload/presigned_post',
                        'POST',
                        presignFormData,
                        true,
                        {
                            'Content-Type': `multipart/form-data; boundary=${boundary1}`,
                            'Content-Length': presignFormData.length.toString(),
                            'X-Requested-With': 'XMLHttpRequest',
                            'Referer': 'https://editor.note.com/'
                        }
                    );

                    if (!presignResponse.data || !presignResponse.data.post) {
                        throw new Error("Presigned URLの取得に失敗しました");
                    }

                    const { url: uploadedImageUrl, action: s3Url, post: s3Params } = presignResponse.data;

                    // Step 2: S3に直接アップロード
                    const boundary2 = `----WebKitFormBoundary${Math.random().toString(36).substring(2)}`;
                    const s3FormParts: Buffer[] = [];

                    const paramOrder = ['key', 'acl', 'Expires', 'policy', 'x-amz-credential', 'x-amz-algorithm', 'x-amz-date', 'x-amz-signature'];
                    for (const key of paramOrder) {
                        if (s3Params[key]) {
                            s3FormParts.push(Buffer.from(
                                `--${boundary2}\r\n` +
                                `Content-Disposition: form-data; name="${key}"\r\n\r\n` +
                                `${s3Params[key]}\r\n`
                            ));
                        }
                    }

                    s3FormParts.push(Buffer.from(
                        `--${boundary2}\r\n` +
                        `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
                        `Content-Type: ${mimeType}\r\n\r\n`
                    ));
                    s3FormParts.push(imageBuffer);
                    s3FormParts.push(Buffer.from('\r\n'));
                    s3FormParts.push(Buffer.from(`--${boundary2}--\r\n`));

                    const s3FormData = Buffer.concat(s3FormParts);

                    const s3Response = await fetch(s3Url, {
                        method: 'POST',
                        headers: {
                            'Content-Type': `multipart/form-data; boundary=${boundary2}`,
                            'Content-Length': s3FormData.length.toString()
                        },
                        body: s3FormData
                    });

                    if (!s3Response.ok && s3Response.status !== 204) {
                        throw new Error(`S3へのアップロードに失敗しました: ${s3Response.status}`);
                    }

                    results.push({
                        path: imagePath,
                        fileName: fileName,
                        imageUrl: uploadedImageUrl,
                        fileSize: imageBuffer.length,
                        fileSizeMB: (imageBuffer.length / 1024 / 1024).toFixed(2),
                        mimeType: mimeType,
                        success: true
                    });

                } catch (error: any) {
                    errors.push({
                        path: imagePath,
                        error: error.message
                    });
                }
            }

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            success: errors.length === 0,
                            totalImages: imagePaths.length,
                            successCount: results.length,
                            errorCount: errors.length,
                            results: results,
                            errors: errors
                        }, null, 2)
                    }
                ]
            };
        }
    );
}
