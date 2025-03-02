const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function initializeDatabase() {
	try {
		// Initialize settings if not exists
		const settings = await prisma.settings.upsert({
			where: { id: 1 },
			update: {},
			create: {
				title: "Airlink",
				description: "AirLink is a free and open source project by AirlinkLabs",
				logo: "../assets/logo.png",
				theme: "default",
				language: "en"
			}
		});

		// Initialize default locations if none exist
		const existingLocations = await prisma.location.findMany();
		if (existingLocations.length === 0) {
			await prisma.location.createMany({
				data: [
					{
						UUID: '550e8400-e29b-41d4-a716-446655440000',
						shortCode: 'NYC',
						name: 'New York',
						description: 'New York Data Center',
						latitude: 40.7128,
						longitude: -74.0060,
						updatedAt: new Date()
					},
					{
						UUID: '550e8400-e29b-41d4-a716-446655440001',
						shortCode: 'LAX', 
						name: 'Los Angeles',
						description: 'Los Angeles Data Center',
						latitude: 34.0522,
						longitude: -118.2437,
						updatedAt: new Date()
					}
				]
			});
		}

		console.log('Database initialized successfully');
	} catch (error) {
		console.error('Error initializing database:', error);
	} finally {
		await prisma.$disconnect();
	}
}

initializeDatabase();