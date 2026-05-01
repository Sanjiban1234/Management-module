import QRCode from 'qrcode';
import fs from 'fs';

const TOKEN = "GYM_ENTRANCE_001";
const PATH = 'gym_wall_qr.png';

async function generate() {
  try {
    await QRCode.toFile(PATH, TOKEN, {
      color: {
        dark: '#000000',
        light: '#ffffff'
      },
      width: 500
    });
    console.log(`QR Code generated for token: ${TOKEN} at ${PATH}`);
  } catch (err) {
    console.error(err);
  }
}

generate();
