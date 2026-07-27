import { httpPost, httpDelete, httpGet } from '../../../utils/http';
import logger from '../../logger';

const AIRLINK_CLOUD_URL = 'https://api.airlinklabs.xyz';

async function streamToBuffer(stream: unknown): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const readable = stream as AsyncIterable<Buffer>;
  for await (const chunk of readable) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export class AirlinkCloudClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async uploadFile(fileStream: unknown, fileName: string) {
    const buffer = await streamToBuffer(fileStream);
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(buffer)]), fileName);

    try {
      const response = await httpPost(`${AIRLINK_CLOUD_URL}/storage/upload`, form, {
        headers: {
          'X-API-Key': this.apiKey,
        },
      });

      return response.data;
    } catch (error) {
      logger.error('Airlink Cloud upload error:', error);
      throw error;
    }
  }

  async deleteFile(fileId: string) {
    try {
      const response = await httpDelete(`${AIRLINK_CLOUD_URL}/storage/files/${fileId}`, {
        headers: {
          'X-API-Key': this.apiKey,
        },
      });

      return response.data;
    } catch (error) {
      logger.error('Airlink Cloud delete error:', error);
      throw error;
    }
  }

  async getDownloadStream(fileId: string) {
    try {
      const response = await httpGet(`${AIRLINK_CLOUD_URL}/storage/download/${fileId}`, {
        headers: {
          'X-API-Key': this.apiKey,
        },
        responseType: 'stream',
      });

      return response;
    } catch (error) {
      logger.error('Airlink Cloud download error:', error);
      throw error;
    }
  }
}
