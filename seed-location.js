const { PrismaClient } = require('@prisma/client');
const path = require('path');

const prisma = new PrismaClient({
	datasources: {
		db: {
			url: `file:${path.join(__dirname, 'prisma', 'dev.db')}`
		}
	}
});

async function seedLocation() {
	try {
		const location = await prisma.location.create({
			data: {
				UUID: '550e8400-e29b-41d4-a716-446655440001',
				shortCode: 'LAX',
				name: 'Los Angeles',
				description: 'Los Angeles Data Center',
				latitude: 34.0522,
				longitude: -118.2437,
				updatedAt: new Date()
			}
		});
		console.log('Created location:', location);
	} catch (error) {
		console.error('Error:', error);
	} finally {
		await prisma.$disconnect();
	}
}

seedLocation();