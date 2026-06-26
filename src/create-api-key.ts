import prisma from './db';
import crypto from 'crypto';

function hashApiKey(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

async function createApiKey() {
  try {
    const rawKey = crypto.randomBytes(32).toString('hex');
    const hashedKey = hashApiKey(rawKey);

    const apiKey = await prisma.apiKey.create({
      data: {
        name: 'Test API Key',
        key: hashedKey,
        description: 'Created for testing the nodes endpoint',
        permissions: JSON.stringify(['*']),
        active: true,
      },
    });

    // eslint-disable-next-line no-console
    console.log('API Key created successfully:');
    // eslint-disable-next-line no-console
    console.log(`ID: ${apiKey.id}`);
    // eslint-disable-next-line no-console
    console.log(`Key (shown once, stored as SHA-256 hash): ${rawKey}`);
    // eslint-disable-next-line no-console
    console.log(`Use this key in the Authorization header: Bearer ${rawKey}`);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error creating API key:', error);
  } finally {
    await prisma.$disconnect();
  }
}

void createApiKey();
