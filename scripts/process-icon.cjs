const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function processIcon() {
  const inputPath = path.join(__dirname, '..', 'Gemini_Generated_Image_tqj8c2tqj8c2tqj8.png');
  const assetsDir = path.join(__dirname, '..', 'assets');
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
    console.log('Created assets output directory.');
  }
  const foregroundPath = path.join(assetsDir, 'icon-foreground.png');
  const backgroundPath = path.join(assetsDir, 'icon-background.png');
  const onlyPath = path.join(assetsDir, 'icon-only.png');

  console.log('Loading original image...');
  const image = sharp(inputPath);
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  console.log(`Dimensions: ${width}x${height}, Channels: ${channels}`);

  // Create a visited array for BFS
  const visited = new Uint8Array(width * height);
  const queue = [];
  let head = 0;

  // Helper functions
  const getIdx = (x, y) => (y * width + x) * channels;
  const getVisitedIdx = (x, y) => y * width + x;

  // Check if pixel is white/near-white
  const isNearWhite = (r, g, b) => {
    const dr = 255 - r;
    const dg = 255 - g;
    const db = 255 - b;
    return (dr * dr + dg * dg + db * db) < 3 * 35 * 35; // Deviation of ~35 per channel
  };

  console.log('Initializing border pixels for flood fill...');
  // Top and bottom borders
  for (let x = 0; x < width; x++) {
    for (let y of [0, height - 1]) {
      const idx = getIdx(x, y);
      const vIdx = getVisitedIdx(x, y);
      if (isNearWhite(data[idx], data[idx + 1], data[idx + 2]) && !visited[vIdx]) {
        visited[vIdx] = 1;
        queue.push({ x, y });
        data[idx + 3] = 0; // Set alpha to 0 (transparent)
      }
    }
  }
  // Left and right borders
  for (let y = 0; y < height; y++) {
    for (let x of [0, width - 1]) {
      const idx = getIdx(x, y);
      const vIdx = getVisitedIdx(x, y);
      if (isNearWhite(data[idx], data[idx + 1], data[idx + 2]) && !visited[vIdx]) {
        visited[vIdx] = 1;
        queue.push({ x, y });
        data[idx + 3] = 0; // Set alpha to 0 (transparent)
      }
    }
  }

  console.log(`Starting BFS flood-fill. Initial queue size: ${queue.length}...`);
  const dx = [-1, 1, 0, 0];
  const dy = [0, 0, -1, 1];

  while (head < queue.length) {
    const { x, y } = queue[head++];
    
    for (let i = 0; i < 4; i++) {
      const nx = x + dx[i];
      const ny = y + dy[i];

      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const vIdx = getVisitedIdx(nx, ny);
        if (!visited[vIdx]) {
          const idx = getIdx(nx, ny);
          if (isNearWhite(data[idx], data[idx + 1], data[idx + 2])) {
            visited[vIdx] = 1;
            queue.push({ x: nx, y: ny });
            data[idx + 3] = 0; // Clear alpha
          }
        }
      }
    }
  }

  console.log(`Flood-fill complete. Visited and cleared ${queue.length} background pixels.`);

  // Find bounding box of remaining non-transparent pixels (alpha > 0)
  let minX = width;
  let maxX = 0;
  let minY = height;
  let maxY = 0;
  let nonTransparentCount = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = getIdx(x, y);
      if (data[idx + 3] > 0) {
        nonTransparentCount++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  console.log(`Non-transparent pixels found: ${nonTransparentCount}`);
  if (nonTransparentCount === 0) {
    throw new Error('All pixels were marked transparent! Adjust threshold tolerance.');
  }

  const boxW = maxX - minX + 1;
  const boxH = maxY - minY + 1;
  console.log(`Logo Bounding Box: [${minX}, ${minY}] to [${maxX}, ${maxY}] (Size: ${boxW}x${boxH})`);

  // Crop & Resize logo proportionally in a single chain!
  console.log('Cropping and resizing logo to fit Safe Zone...');
  const maxSafeSize = 675;
  const scale = maxSafeSize / Math.max(boxW, boxH);
  const targetW = Math.round(boxW * scale);
  const targetH = Math.round(boxH * scale);
  console.log(`Resizing logo to fit Safe Zone: ${targetW}x${targetH} (Scale Factor: ${scale.toFixed(4)})`);

  const transparentLogo = sharp(data, { raw: { width, height, channels } });
  const resizedLogoBuffer = await transparentLogo
    .extract({ left: minX, top: minY, width: boxW, height: boxH })
    .resize(targetW, targetH)
    .png()
    .toBuffer();

  // Composite scaled logo onto a transparent 1024x1024 canvas
  console.log('Centering and compositing onto 1024x1024 canvas...');
  const left = Math.round((1024 - targetW) / 2);
  const top = Math.round((1024 - targetH) / 2);

  await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([{ input: resizedLogoBuffer, left, top }])
    .png()
    .toFile(foregroundPath);

  console.log(`Foreground icon generated successfully at: ${foregroundPath}`);

  // Create Background layer
  console.log('Generating background icon...');
  await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: '#121212'
    }
  })
    .png()
    .toFile(backgroundPath);

  console.log(`Background icon generated successfully at: ${backgroundPath}`);

  // Create Fallback Icon (icon-only.png)
  console.log('Generating fallback icon (icon-only.png)...');
  await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: '#121212'
    }
  })
    .composite([{ input: resizedLogoBuffer, left, top }])
    .png()
    .toFile(onlyPath);
  console.log(`Fallback icon generated successfully at: ${onlyPath}`);

  console.log('Success!');
}

processIcon().catch(err => {
  console.error('Fatal error processing icon:', err);
  process.exit(1);
});
