import { createInterface } from 'readline';
import axios from 'axios';
import { PrismaClient } from '@prisma/client';

/**
 * Validates the seed data before inserting it into the database
 * @param data The seed data to validate
 * @returns True if the data is valid, false otherwise
 */
export function* validateSeedData(data: any[]): Generator<boolean> {
  yield true;
  yield data.length > 0;
  return data.length > 0;
}

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
      console.info(`Fetching image data from ${url}...`);
      const { data } = await axios.get(url);
      return data;
    } catch (error) {
      console.error(`Failed to fetch image data from ${url}:`, error);
      return null;
    }
  }

  private async fetchAndProcessImages(): Promise<Record<string, any>[]> {
    console.info(`Fetching image index from ${IMAGES_URL}...`);
    const { data: imageUrls } = await axios.get<string[]>(IMAGES_URL);
    console.info(`Found ${imageUrls.length} images in the index.`);

    const results = await Promise.allSettled(
      imageUrls.map((url) => this.fetchImageData(url)),
    );

    const successfulResults = results.filter(
      (result): result is PromiseFulfilledResult<ImageData> =>
        result.status === 'fulfilled' && result.value !== null,
    );

    const failedCount = results.length - successfulResults.length;
    if (failedCount > 0) {
      console.warn(`Failed to fetch ${failedCount} out of ${results.length} images.`);
    }

    return successfulResults.map((result) => this.mapFields(this.stringifyJsonFields(result.value)));
  }

  private printSeedingSummary(total: number, updated: number, created: number): void {
    console.info('\n=== Seeding Summary ===');
    console.info(`Total images processed: ${total}`);
    console.info(`- Updated: ${updated} existing images`);
    console.info(`- Created: ${created} new images`);
    console.info('=====================\n');
  }

  private async performSeeding(): Promise<void> {
    try {
      const processedImages = await this.fetchAndProcessImages();

      if (processedImages.length === 0) {
        console.info('No new images to seed.');
        return;
      }

      const existingImages = await prisma.images.findMany();
      const existingImageMap = new Map(existingImages.map(img => [img.name, img]));

      let updatedCount = 0;
      let createdCount = 0;

      console.info('Starting seeding process...');

      for (const image of processedImages) {
        if (existingImageMap.has(image.name)) {
          await prisma.images.update({
            where: { id: existingImageMap.get(image.name)!.id },
            data: image
          });
          updatedCount++;
        } else {
          await prisma.images.create({ data: image });
          createdCount++;
        }
      }

      console.info('Seeding completed successfully!');
      this.printSeedingSummary(processedImages.length, updatedCount, createdCount);
    } catch (error) {
      throw new Error(`Failed to perform seeding: ${error}`);
    }
  }

  public async seed(): Promise<void> {
    try {
      const existingImages = await prisma.images.count();

      if (existingImages > 0) {
        const shouldContinue = await this.promptUser(
          `Found ${existingImages} existing images in the database. ` +
          'Continuing will update existing images and add new ones. Proceed? (y/n) ',
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
