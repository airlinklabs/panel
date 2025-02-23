const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkLocations() {
	try {
		const locations = await prisma.location.findMany();
		console.log('Locations:', locations);
	} catch (error) {
		console.error('Error:', error);
	} finally {
		await prisma.$disconnect();
	}
}

checkLocations();