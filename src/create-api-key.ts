import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

async function createApiKey() {
  try {
    const key = crypto.randomBytes(32).toString('hex');
    
    const apiKey = await prisma.apiKey.create({
      data: {
        name: 'Test API Key',
        key: key,
        description: 'Created for testing the nodes endpoint',
        permissions: JSON.stringify(['*']),
        active: true,
      },
    });
    
    console.log('API Key created successfully:');
    console.log(`ID: ${apiKey.id}`);
    console.log(`Key: ${apiKey.key}`);
    console.log(`Use this key in the Authorization header: Bearer ${apiKey.key}`);
  } catch (error) {
    console.error('Error creating API key:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createApiKey();
