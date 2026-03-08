import sharp from 'sharp';

export async function blurImageBottom(imageUrl: string, blurHeight: number = 80): Promise<Buffer> {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error('Failed to fetch image');
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    const imageInstance = sharp(buffer);
    const metadata = await imageInstance.metadata();
    const width = metadata.width || 300;
    const height = metadata.height || 400;
    
    const topHeight = Math.max(0, height - blurHeight);
    
    // Extract top portion (unblurred)
    const topPortion = await sharp(buffer)
      .extract({ left: 0, top: 0, width, height: topHeight })
      .toBuffer();
    
    // Extract bottom portion and blur it
    const bottomPortion = await sharp(buffer)
      .extract({ left: 0, top: topHeight, width, height: blurHeight })
      .blur(25)
      .toBuffer();
    
    // Composite back together
    return await sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 0, g: 0, b: 0 }
      }
    })
      .composite([
        { input: topPortion, left: 0, top: 0 },
        { input: bottomPortion, left: 0, top: topHeight }
      ])
      .toBuffer();
  } catch (error) {
    console.error('Error blurring image:', error);
    throw error;
  }
}

export async function mergeCardImages(imageUrls: string[], columns?: number): Promise<Buffer> {
  try {
    const imageBuffers = await Promise.all(
      imageUrls.map(async (url) => {
        try {
          const response = await fetch(url);
          if (!response.ok) {
            console.warn(`Failed to fetch image: ${url}`);
            return null;
          }
          const arrayBuffer = await response.arrayBuffer();
          return Buffer.from(arrayBuffer);
        } catch (error) {
          console.warn(`Error fetching image ${url}:`, error);
          return null;
        }
      })
    );

    const validBuffers = imageBuffers.filter(buffer => buffer !== null) as Buffer[];

    if (validBuffers.length === 0) {
      throw new Error('No valid images to merge');
    }

    const CARD_WIDTH = 300;
    const CARD_HEIGHT = 400;
    const SPACING = 10;

    const resizedImages = await Promise.all(
      validBuffers.map(buffer =>
        sharp(buffer)
          .resize(CARD_WIDTH, CARD_HEIGHT, { fit: 'cover' })
          .toBuffer()
      )
    );

    // Determine layout: grid or single row
    const cardsPerRow = columns || resizedImages.length;
    const rows = Math.ceil(resizedImages.length / cardsPerRow);
    
    const totalWidth = (CARD_WIDTH * cardsPerRow) + (SPACING * (cardsPerRow - 1));
    const totalHeight = (CARD_HEIGHT * rows) + (SPACING * (rows - 1));

    const canvas = sharp({
      create: {
        width: totalWidth,
        height: totalHeight,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    });

    const compositeImages = resizedImages.map((buffer, index) => {
      const row = Math.floor(index / cardsPerRow);
      const col = index % cardsPerRow;
      
      return {
        input: buffer,
        left: col * (CARD_WIDTH + SPACING),
        top: row * (CARD_HEIGHT + SPACING)
      };
    });

    return await canvas.composite(compositeImages).png().toBuffer();
  } catch (error) {
    console.error('Error merging images:', error);
    throw error;
  }
}
