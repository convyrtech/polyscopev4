const fs = require('fs');
const path = require('path');

// Minimal 1x1 pixel blue PNG base64
const base64Png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const buffer = Buffer.from(base64Png, 'base64');
// Save as icon.png (plasmo needs 512x512 ideally, but this might pass verification checks if strictly just file existence, 
// though for resizing it might fail. Better to try. User prompt said "dummy PNG buffer".
// Actually, let's just use this 1x1. If plasmo checks dimensions, we might need a real one.
// Let's assume it just needs the file.)

const dest = path.join(__dirname, 'apps', 'extension', 'assets', 'icon.png');
fs.writeFileSync(dest, buffer);
console.log('Icon created at', dest);
