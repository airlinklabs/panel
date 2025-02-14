import { createInterface } from 'readline';
import axios from 'axios';
import { PrismaClient } from '@prisma/client';

const IMAGES_URL =
  'https://raw.githubusercontent.com/airlinklabs/images/refs/heads/main/index.json';
const FIELD_MAPPING: Record<string, string> = {
  docker_images: 'dockerImages',
};

const prisma = new PrismaClient();
const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

interface ImageData {
  meta: Record<string, any>;
  dockerImages: Record<string, any>;
  info: Record<string, any>;
  scripts: Record<string, any>;
  variables: Record<string, any>;
  [key: string]: any;
}

class Seeder {
  private async promptUser(message: string): Promise<boolean> {
    return new Promise((resolve) => {
      rl.question(message, (answer) => {
        resolve(answer.toLowerCase() === 'y');
      });
    });
  }

  private mapFields(data: Record<string, any>): Record<string, any> {
    return Object.entries(data).reduce(
      (acc, [key, value]) => ({
        ...acc,
        [FIELD_MAPPING[key] || key]: value,
      }),
      {},
    );
  }

  private stringifyJsonFields(image: Record<string, any>): Record<string, any> {
    const jsonFields = ['meta', 'dockerImages', 'info', 'scripts', 'variables'];

    if (!image.dockerImages && image.docker_images) {
      image.dockerImages = image.docker_images;
    } else if (!image.dockerImages) {
      image.dockerImages = {};
    }

    return {
      ...image,
      ...Object.fromEntries(
        jsonFields.map((field) => [field, JSON.stringify(image[field])]),
      ),
    };
  }

  private async fetchImageData(url: string): Promise<ImageData | null> {
    try {
      const { data } = await axios.get(url);
      return data;
    } catch (error) {
      console.error(`Failed to fetch image data from ${url}:`, error);
      return null;
    }
  }

  private async fetchAndProcessImages(): Promise<Record<string, any>[]> {
    const { data: imageUrls } = await axios.get<string[]>(IMAGES_URL);

    const results = await Promise.allSettled(
      imageUrls.map((url) => this.fetchImageData(url)),
    );

    return results
      .filter(
        (result): result is PromiseFulfilledResult<ImageData> =>
          result.status === 'fulfilled' && result.value !== null,
      )
      .map((result) => this.mapFields(this.stringifyJsonFields(result.value)));
  }

  private async performSeeding(): Promise<void> {
    try {
      const processedImages = await this.fetchAndProcessImages();

      if (processedImages.length === 0) {
        console.info('No new images to seed.');
        return;
      }

      await prisma.images.createMany({ data: processedImages });
      console.info(`Successfully seeded ${processedImages.length} images!`);
    } catch (error) {
      throw new Error(`Failed to perform seeding: ${error}`);
    }
  }

  public async seed(): Promise<void> {
    try {
      const existingImages = await prisma.images.count();

      if (existingImages > 0) {
        const shouldContinue = await this.promptUser(
          '\'images\' is already set in the database. Do you want to continue seeding? (y/n) ',
        );

        if (!shouldContinue) {
          console.info('Seeding aborted by the user.');
          return;
        }
      }

      await this.performSeeding();
    } catch (error) {
      console.error('Failed during seeding process:', error);
      throw error;
    } finally {
      rl.close();
      await prisma.$disconnect();
    }
  }
}

// Error handling
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Main execution
const seeder = new Seeder();
seeder
  .seed()
  .catch((error) => {
    console.error('Fatal error during seeding:', error);
    process.exit(1);
  })
  .finally(() => {
    console.info('Exiting...');
  });
