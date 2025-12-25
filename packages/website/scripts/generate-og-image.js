import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

async function generateOgImage() {
  const svgPath = join(publicDir, 'og-image.svg');
  const pngPath = join(publicDir, 'og-image.png');
  
  try {
    const svg = readFileSync(svgPath);
    
    await sharp(svg)
      .resize(1200, 630)
      .png()
      .toFile(pngPath);
    
    console.log('✓ Generated og-image.png');
  } catch (error) {
    console.error('Failed to generate og-image.png:', error.message);
    process.exit(1);
  }
}

async function generateFavicons() {
  const svgPath = join(publicDir, 'favicon.svg');
  
  try {
    const svg = readFileSync(svgPath);
    
    // Generate different sizes
    await sharp(svg).resize(32, 32).png().toFile(join(publicDir, 'favicon-32x32.png'));
    await sharp(svg).resize(16, 16).png().toFile(join(publicDir, 'favicon-16x16.png'));
    await sharp(svg).resize(180, 180).png().toFile(join(publicDir, 'apple-touch-icon.png'));
    
    console.log('✓ Generated favicon PNGs');
  } catch (error) {
    console.error('Failed to generate favicons:', error.message);
    process.exit(1);
  }
}

async function main() {
  console.log('Generating social media assets...\n');
  await generateOgImage();
  await generateFavicons();
  console.log('\n✓ All assets generated successfully!');
}

main();

