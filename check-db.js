const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDatabase() {
  try {
    console.log('Checking database connection...');
		
    const locations = await prisma.location.findMany();
    console.log('Locations:', locations);
		
    const settings = await prisma.settings.findFirst();
    console.log('Settings:', settings);
		
  } catch (error) {
    console.error('Database error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDatabase();