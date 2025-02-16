// install.ts

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import logger from '../logger';

const prisma = new PrismaClient();

class Install {
  async install(key: string, email: string, password: string): Promise<void> {
    const installationKey = 'your-installation-key'; // Replace with your actual key

    // Validate the installation key
    if (key !== installationKey) {
      throw new Error('Invalid installation key');
    }

    // Check if the first user already exists
    const existingUser = await prisma.users.findFirst();
    if (existingUser) {
      throw new Error('Installation has already been completed');
    }

    // Hash the password before storing it
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create the first user
    const newUser = await prisma.users.create({
      data: {
        email,
        password: hashedPassword, // Store the hashed password
        isAdmin: true, // Set the first user as an admin (optional)
      },
    });

    logger.debug('First user created:', newUser);
  }
}

const install = new Install();

export default install;
