import fs from 'fs';

export const DEFAULT_UPLOAD_CHUNK_SIZE = 5 * 1024 * 1024;

/**
 * Stream a temporary upload file in bounded chunks. Consumers must await each
 * chunk handler so a slow daemon applies backpressure to the upload pipeline.
 */
export async function forEachUploadChunk(
  filePath: string,
  chunkSize = DEFAULT_UPLOAD_CHUNK_SIZE,
  onChunk: (chunk: Buffer, index: number, totalChunks: number) => Promise<void>,
): Promise<void> {
  const stat = await fs.promises.stat(filePath);
  const totalChunks = Math.ceil(stat.size / chunkSize);
  const stream = fs.createReadStream(filePath, { highWaterMark: chunkSize });
  let index = 0;

  try {
    for await (const chunk of stream) {
      await onChunk(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk), index, totalChunks);
      index += 1;
    }
  } finally {
    stream.destroy();
  }
}
