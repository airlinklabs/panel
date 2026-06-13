// install.ts

import prisma from '../../db';
import bcrypt from 'bcryptjs';
import logger from '../logger';


class Install {
  async install(email: string, password: string): Promise<void> {
    // Check if the first user already exists
    const existingUser = await prisma.users.findFirst();
    if (existingUser) {
      throw new Error('Installation has already been completed');
    }

    // Hash the password before storing it
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create the first user
    await prisma.users.create({
      data: {
        email,
        password: hashedPassword, // Store the hashed password
        isAdmin: true, // Set the first user as an admin (optional)
      },
    });

    logger.info('First admin user created');
  }
}

const install = new Install();

export default install;
