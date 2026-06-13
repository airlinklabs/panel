import prisma from './db';
import crypto from 'crypto';


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
    
    console.log('API Key created successfully:'); // eslint-disable-line no-console
    console.log(`ID: ${apiKey.id}`); // eslint-disable-line no-console
    console.log(`Key: ${apiKey.key}`); // eslint-disable-line no-console
    console.log(`Use this key in the Authorization header: Bearer ${apiKey.key}`); // eslint-disable-line no-console
  } catch (error) {
    console.error('Error creating API key:', error); // eslint-disable-line no-console
  } finally {
    await prisma.$disconnect();
  }
}

createApiKey();
