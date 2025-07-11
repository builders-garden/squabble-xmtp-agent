/**
 * Check XMTP Installations
 *
 * This script checks the current number of XMTP installations.
 */

import { Client } from "@xmtp/node-sdk";
import {
  createSigner,
  getEncryptionKeyFromHex,
  validateEnvironment,
} from "../../helpers/client.ts";

async function checkInstallations() {
  try {
    console.log("🔍 Checking XMTP installations...");

    // Get environment variables
    const { WALLET_KEY, ENCRYPTION_KEY, XMTP_ENV } = validateEnvironment([
      "WALLET_KEY",
      "ENCRYPTION_KEY",
      "XMTP_ENV",
    ]);

    // Create signer
    const signer = createSigner(WALLET_KEY);
    const identifier = await signer.getIdentifier();
    console.log(`📧 Wallet address: ${identifier.identifier}`);

    // Get InboxID by creating a temporary client
    console.log("🔍 Getting InboxID...");

    let inboxId;
    try {
      const tempClient = await Client.create(signer, {
        dbEncryptionKey: getEncryptionKeyFromHex(ENCRYPTION_KEY),
        env: XMTP_ENV,
      });
      inboxId = tempClient.inboxId;
      console.log(`📦 InboxID: ${inboxId}`);
    } catch (error) {
      // If client creation fails, extract InboxID from error message
      const errorMessage = error.message;
      const inboxIdMatch = errorMessage.match(/InboxID ([a-f0-9]+)/);

      if (!inboxIdMatch) {
        throw new Error("Could not extract InboxID from error message");
      }

      inboxId = inboxIdMatch[1];
      console.log(`📦 InboxID (from error): ${inboxId}`);
    }

    // Get current installations
    console.log("📊 Getting current installations...");
    const inboxState = await Client.inboxStateFromInboxIds([inboxId], XMTP_ENV);
    const currentInstallations = inboxState[0].installations;

    console.log(`\n📊 Installation Report:`);
    console.log(`  Total installations: ${currentInstallations.length}`);

    if (currentInstallations.length > 0) {
      console.log(`\n📋 Installation details:`);
      currentInstallations.forEach((installation, index) => {
        console.log(
          `  ${index + 1}. ${installation.id} (${
            installation.createdAt || "unknown date"
          })`
        );
      });
    } else {
      console.log(`  Status: ✅ No installations found`);
    }

    if (currentInstallations.length > 10) {
      console.log(
        `\n⚠️  Warning: High number of installations (${currentInstallations.length})`
      );
      console.log(
        `   Consider running: yarn tsx lib/scripts/clean-installations.js`
      );
    }
  } catch (error) {
    console.error("❌ Check failed:", error.message);
    console.error("\nTroubleshooting:");
    console.error(
      "1. Check your .env file has correct WALLET_KEY, ENCRYPTION_KEY, and XMTP_ENV"
    );
    console.error("2. Make sure you have network connectivity");
    process.exit(1);
  }
}

// Run the check
checkInstallations().catch((error) => {
  console.error("💥 Unexpected error:", error);
  process.exit(1);
});
