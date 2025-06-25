/**
 * Storage Utilities
 *
 * This module handles local storage operations for wallet data and ensures
 * the necessary storage directories exist.
 */

import * as fs from "fs";
import { STORAGE_CONFIG } from "../../config/constants";

/**
 * Ensure local storage directories exist
 *
 * Creates the necessary directories for XMTP and wallet data storage
 * if they don't already exist.
 */
export function ensureLocalStorage(): void {
  if (!fs.existsSync(STORAGE_CONFIG.XMTP_DIR)) {
    fs.mkdirSync(STORAGE_CONFIG.XMTP_DIR, { recursive: true });
  }
  if (!fs.existsSync(STORAGE_CONFIG.WALLET_DIR)) {
    fs.mkdirSync(STORAGE_CONFIG.WALLET_DIR, { recursive: true });
  }
}

/**
 * Save wallet data to local storage
 *
 * Persists wallet data to a JSON file in the wallet storage directory.
 * Each user gets their own wallet file based on their unique ID.
 *
 * @param userId - The unique identifier for the user
 * @param walletData - The wallet data to be saved (as JSON string)
 */
export function saveWalletData(userId: string, walletData: string): void {
  const localFilePath = `${STORAGE_CONFIG.WALLET_DIR}/${userId}.json`;
  try {
    // Only create the file if it doesn't exist to prevent overwriting
    if (!fs.existsSync(localFilePath)) {
      fs.writeFileSync(localFilePath, walletData);
    }
  } catch (error) {
    console.error(`Failed to save wallet data to file: ${error as string}`);
  }
}

/**
 * Get wallet data from local storage
 *
 * Retrieves previously saved wallet data for a specific user.
 * Returns null if no wallet data exists for the user.
 *
 * @param userId - The unique identifier for the user
 * @returns The wallet data as a string, or null if not found
 */
export function getWalletData(userId: string): string | null {
  const localFilePath = `${STORAGE_CONFIG.WALLET_DIR}/${userId}.json`;
  try {
    if (fs.existsSync(localFilePath)) {
      return fs.readFileSync(localFilePath, "utf8");
    }
  } catch (error) {
    console.warn(`Could not read wallet data from file: ${error as string}`);
  }
  return null;
}
