const fs = require('fs');
const { Keypair } = require('@solana/web3.js');

/**
 * Generates a new Solana keypair for the House and saves the secret key to house-key.json.
 */
function generateHouseWallet() {
  const houseKeypair = Keypair.generate();
  const secretKeyArray = Array.from(houseKeypair.secretKey);
  const publicKey = houseKeypair.publicKey.toBase58();

  const walletData = {
    publicKey: publicKey,
    secretKey: secretKeyArray,
  };

  fs.writeFileSync('./house-key.json', JSON.stringify(walletData, null, 2));
  console.log(`--- House Wallet Generated ---`);
  console.log(`Public Key: ${publicKey}`);
  console.log(`Secret key saved to ./house-key.json`);
}

try {
  generateHouseWallet();
} catch (error) {
  console.error("Error generating wallet. Ensure @solana/web3.js is installed.");
  process.exit(1);
}
