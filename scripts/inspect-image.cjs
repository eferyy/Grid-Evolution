const sharp = require('sharp');
const path = require('path');

const imagePath = path.join(__dirname, '..', 'Gemini_Generated_Image_tqj8c2tqj8c2tqj8.png');

sharp(imagePath)
  .metadata()
  .then(metadata => {
    console.log('Image Metadata:', JSON.stringify(metadata, null, 2));
  })
  .catch(err => {
    console.error('Error reading image metadata:', err);
  });
