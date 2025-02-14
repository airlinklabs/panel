const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function createLocation() {
  try {
    const location = await prisma.location.create({
      data: {
        shortCode: 'NYC',
        name: 'New York',
        description: 'New York Data Center',
        latitude: 40.7128,
        longitude: -74.0060
      }
    });
    console.log('Created location:', location);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createLocation();