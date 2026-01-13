import { noteApiRequest } from "../utils/api-client.js";
import { env } from "../config/environment.js";

export interface ImageData {
    fileName: string;
    base64: string;
    mimeType: string;
}

/**
 * note.comに画像をアップロードするユーティリティ
 */
export class NoteImageUploader {
    /**
     * 画像をアップロードしてURLを取得
     */
    static async uploadImages(images: ImageData[]): Promise<Map<string, string>> {
        const uploadedImages = new Map<string, string>();

        if (!images || images.length === 0) {
            return uploadedImages;
        }

        console.error(`${images.length}件の画像をアップロード中...`);

        for (const img of images) {
            try {
                const imageBuffer = Buffer.from(img.base64, 'base64');
                const fileName = img.fileName;
                const mimeType = img.mimeType || 'image/png';

                // Step 1: Presigned URLを取得
                const boundary1 = `----WebKitFormBoundary${Math.random().toString(36).substring(2)}`;
                const presignFormParts: Buffer[] = [];
                presignFormParts.push(Buffer.from(
                    `--${boundary1}\r\n` +
                    `Content-Disposition: form-data; name="filename"\r\n\r\n` +
                    `${fileName}\r\n`
                ));
                presignFormParts.push(Buffer.from(`--${boundary1}--\r\n`));
                const presignFormData = Buffer.concat(presignFormParts);

                const presignResponse = await fetch('https://editor.note.com/api/v1/presigns', {
                    method: 'POST',
                    headers: {
                        'Cookie': `session_v5=${env.NOTE_SESSION_V5}`,
                        'x-csrf-token': env.NOTE_XSRF_TOKEN,
                        'content-type': `multipart/form-data; boundary=${boundary1}`,
                        'origin': 'https://editor.note.com',
                        'referer': 'https://editor.note.com/',
                    },
                    body: presignFormData,
                });

                if (!presignResponse.ok) {
                    throw new Error(`Presigned URL取得失敗: ${presignResponse.status}`);
                }

                const presignData = await presignResponse.json();
                const presignedUrl = presignData.data?.url;
                const s3Url = presignData.data?.s3_url;

                if (!presignedUrl || !s3Url) {
                    throw new Error('Presigned URLの形式が不正');
                }

                // Step 2: S3に画像をアップロード
                const s3Response = await fetch(presignedUrl, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': mimeType,
                    },
                    body: imageBuffer,
                });

                // 204も成功とみなす
                if (!s3Response.ok && s3Response.status !== 204) {
                    throw new Error(`S3アップロード失敗: ${s3Response.status}`);
                }

                // URLをマップに保存
                uploadedImages.set(fileName, s3Url);
                console.error(`画像アップロード成功: ${fileName} -> ${s3Url}`);

            } catch (error) {
                console.error(`画像アップロード失敗 ${img.fileName}: ${error}`);
                throw error;
            }
        }

        return uploadedImages;
    }

    /**
     * Markdown内の画像参照をHTMLに置換
     */
    static replaceImageReferences(
        body: string,
        uploadedImages: Map<string, string>
    ): string {
        let processedBody = body;

        // Obsidian形式の画像参照を置換: ![[filename]]
        processedBody = processedBody.replace(
            /!\[\[([^\]]+)\]\]/g,
            (match, fileName) => {
                const url = uploadedImages.get(fileName.trim());
                if (url) {
                    return `<figure><img src="${url}"></figure>`;
                }
                return match;
            }
        );

        // Markdown形式の画像参照を置換: ![alt](path)
        processedBody = processedBody.replace(
            /!\[([^\]]*)\]\(([^)]+)\)/g,
            (match, alt, path) => {
                const fileName = path.split('/').pop() || path;
                const url = uploadedImages.get(fileName);
                if (url) {
                    return `<figure><img src="${url}" alt="${alt}"></figure>`;
                }
                return match;
            }
        );

        return processedBody;
    }
}
