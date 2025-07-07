/**
 * Standalone Installation Cleaner
 *
 * This script cleans ALL XMTP installations to start completely fresh.
 * Use this when you get "too many installations" errors that prevent server startup.
 */

import { Client } from "@xmtp/node-sdk";
import {
  createSigner,
  getEncryptionKeyFromHex,
  validateEnvironment,
} from "../../helpers/client.ts";

async function cleanAllInstallations() {
  try {
    console.log(
      "🧹 Starting complete installation cleanup (removing ALL installations)..."
    );

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

    // We need to get the InboxID first - create a temporary client to get it
    console.log("🔍 Getting InboxID...");

    try {
      // Try to create client to get InboxID (this might fail due to installations)
      const tempClient = await Client.create(signer, {
        dbEncryptionKey: getEncryptionKeyFromHex(ENCRYPTION_KEY),
        env: XMTP_ENV,
      });
      const inboxId = tempClient.inboxId;
      console.log(`📦 InboxID: ${inboxId}`);
    } catch (error) {
      // If client creation fails, extract InboxID from error message
      const errorMessage = error.message;
      const inboxIdMatch = errorMessage.match(/InboxID ([a-f0-9]+)/);

      if (!inboxIdMatch) {
        throw new Error("Could not extract InboxID from error message");
      }

      const inboxId = inboxIdMatch[1];
      console.log(`📦 InboxID (from error): ${inboxId}`);

      // Get current installations using static method
      console.log("📊 Getting current installations...");
      const inboxState = await Client.inboxStateFromInboxIds(
        [inboxId],
        XMTP_ENV
      );
      const currentInstallations = inboxState[0].installations;

      console.log(`✓ Current installations: ${currentInstallations.length}`);

      // Check if cleanup is needed
      if (currentInstallations.length === 0) {
        console.log("✅ No installations found - already clean");
        return;
      }

      console.log(
        `⚠️  Will remove ALL ${currentInstallations.length} installations`
      );

      // Get ALL installations to revoke
      const installationsToRevoke = currentInstallations.map(
        (installation) => installation.bytes
      );

      const installationsToRevokeInfo = currentInstallations.map(
        (installation, index) => ({
          index: index + 1,
          id: installation.id,
          createdAt: installation.createdAt,
        })
      );

      console.log("📋 ALL installations to revoke:");
      installationsToRevokeInfo.forEach((inst) => {
        console.log(
          `  ${inst.index}. ${inst.id} (${inst.createdAt || "unknown date"})`
        );
      });

      console.log(
        `\n🔄 Revoking ALL ${currentInstallations.length} installations...`
      );

      // Revoke ALL installations
      await Client.revokeInstallations(
        signer,
        inboxId,
        installationsToRevoke,
        XMTP_ENV
      );

      console.log(
        `✅ Successfully revoked ALL ${currentInstallations.length} installations`
      );

      // Verify final state
      const finalInboxState = await Client.inboxStateFromInboxIds(
        [inboxId],
        XMTP_ENV
      );
      const finalInstallations = finalInboxState[0].installations;

      console.log(`\n📊 Final state:`);
      console.log(`  Installations: ${finalInstallations.length}`);
      console.log(`  Status: ✅ Completely clean - ready for fresh start`);

      console.log(
        "\n🎉 Complete cleanup finished! You can now start the server:"
      );
      console.log("   yarn start");
      console.log(
        "\nNote: The server will create a new installation automatically when it starts."
      );
    }
  } catch (error) {
    console.error("❌ Cleanup failed:", error.message);
    console.error("\nTroubleshooting:");
    console.error(
      "1. Check your .env file has correct WALLET_KEY, ENCRYPTION_KEY, and XMTP_ENV"
    );
    console.error("2. Make sure you have network connectivity");
    console.error("3. Try running the script again");
    process.exit(1);
  }
}

// Run the cleanup
cleanAllInstallations().catch((error) => {
  console.error("💥 Unexpected error:", error);
  process.exit(1);
});
