import { S3Client, DeleteObjectCommand, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { createReadStream } from 'node:fs';
import prisma from '../../../db';

export const S3_KEY_PREFIX = 's3:';

export async function getS3Config() {
  const s = await prisma.settings.findUnique({ where: { id: 1 } });
  if (!s?.s3Enabled || !s.s3Bucket || !s.s3AccessKey || !s.s3SecretKey) {
    throw new Error('S3 not configured');
  }
  return {
    client: new S3Client({
      endpoint: s.s3Endpoint ?? undefined,
      region: s.s3Region ?? 'us-east-1',
      credentials: { accessKeyId: s.s3AccessKey, secretAccessKey: s.s3SecretKey },
      forcePathStyle: s.s3PathStyle,
    }),
    bucket: s.s3Bucket,
  };
}

export async function uploadToS3(localPath: string, key: string): Promise<string> {
  const { client, bucket } = await getS3Config();
  const upload = new Upload({
    client,
    params: { Bucket: bucket, Key: key, Body: createReadStream(localPath) },
  });
  await upload.done();
  return key;
}

export async function uploadStreamToS3(stream: import('node:stream').Readable, key: string): Promise<string> {
  const { client, bucket } = await getS3Config();
  const upload = new Upload({
    client,
    params: { Bucket: bucket, Key: key, Body: stream },
  });
  await upload.done();
  return key;
}

export async function deleteFromS3(key: string): Promise<void> {
  const { client, bucket } = await getS3Config();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export async function getS3ObjectStream(key: string) {
  const { client, bucket } = await getS3Config();
  const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return response.Body as import('node:stream').Readable | undefined;
}

export async function testS3Connection(): Promise<{ success: boolean; latency?: number; error?: string }> {
  const start = Date.now();
  try {
    const { client, bucket } = await getS3Config();
    await client.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }));
    return { success: true, latency: Date.now() - start };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'S3 connection failed',
    };
  }
}

export function isS3Backup(filePath: string): boolean {
  return filePath.startsWith(S3_KEY_PREFIX);
}
