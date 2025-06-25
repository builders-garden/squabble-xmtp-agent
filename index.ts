/**
 * Squabble Agent - Main Entry Point
 *
 * This is the main entry point for the Squabble XMTP Agent. The agent facilitates
 * a fast-paced, social word game designed for private friend groups on XMTP.
 *
 * Architecture Overview:
 * - Uses XMTP Protocol for secure messaging
 * - Integrates with Coinbase CDP for wallet functionality
 * - Powered by OpenAI GPT-4 for intelligent responses
 * - Provides REST API for external integrations
 *
 * Key Features:
 * - Real-time multiplayer word game management
 * - Integrated betting system with USDC
 * - Group chat leaderboards
 * - AI-powered game assistance
 */

import { validateEnvironment } from "./helpers/client";
import { ensureLocalStorage } from "./lib/utils/storage-utils";
import {
  initializeXmtpClient,
  startMessageListener,
} from "./services/xmtp-service";
import { setupApiServer } from "./api/api";
import { REQUIRED_ENV_VARS } from "./config/constants";

/**
 * Environment Configuration
 *
 * Validates and extracts all required environment variables at startup.
 * This ensures the application fails fast if configuration is missing.
 */
const ENV_CONFIG = validateEnvironment(REQUIRED_ENV_VARS) as {
  WALLET_KEY: string;
  ENCRYPTION_KEY: string;
  XMTP_ENV: string;
  CDP_API_KEY_NAME: string;
  CDP_API_KEY_PRIVATE_KEY: string;
  NETWORK_ID: string;
  OPENAI_API_KEY: string;
  SQUABBLE_URL: string;
  AGENT_SECRET: string;
};

/**
 * Initialize and start the Squabble Agent
 *
 * This is the main initialization function that:
 * 1. Sets up local storage directories
 * 2. Initializes the XMTP client
 * 3. Starts the API server
 * 4. Begins listening for XMTP messages
 */
async function main(): Promise<void> {
  try {
    console.log("🚀 Initializing Squabble Agent on XMTP...");

    // Ensure local storage directories exist
    console.log("📁 Setting up local storage...");
    ensureLocalStorage();

    // Initialize XMTP client
    console.log("🔗 Connecting to XMTP network...");
    const xmtpClient = await initializeXmtpClient(ENV_CONFIG);

    // Start API server for external integrations
    console.log("🌐 Starting API server...");
    setupApiServer(xmtpClient);

    // Start XMTP message listener
    console.log("🎮 Squabble Agent is ready! Starting message listener...");
    await startMessageListener(xmtpClient, ENV_CONFIG);
  } catch (error) {
    console.error("❌ Failed to start Squabble Agent:", error);
    process.exit(1);
  }
}

/**
 * Graceful shutdown handler
 *
 * Handles cleanup when the process is terminated
 */
process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down Squabble Agent gracefully...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n🛑 Shutting down Squabble Agent gracefully...");
  process.exit(0);
});

// Start the application
main().catch((error) => {
  console.error("💥 Unhandled error in main:", error);
  process.exit(1);
});
