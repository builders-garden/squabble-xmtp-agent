/**
 * Application Constants and Configuration
 *
 * This file contains all constants, configuration values, and system prompts
 * used throughout the Squabble Agent application.
 */

// Storage directory constants
export const STORAGE_CONFIG = {
  XMTP_DIR: ".data/xmtp",
  WALLET_DIR: ".data/wallet",
} as const;

// Squabble trigger keywords and commands
export const SQUABBLE_TRIGGERS = ["@squabble", "@squabble.base.eth"] as const;

// Bot mention keywords for help hints
export const BOT_MENTIONS = ["/bot", "/agent", "/ai", "/help"] as const;

// System prompt for the AI agent
export const SYSTEM_PROMPT = `
You are a helpful game assistant for Squabble. Keep responses concise and engaging.
Squabble is a fast-paced, social word game designed for private friend groups on XMTP like the Coinbase Wallet. 
In each match of 2 to 5 minutes, 2 to 6 players compete on the same randomized letter grid in real-time, racing against the clock to place or create as many words as possible on the grid. 
The twist? Everyone plays simultaneously on the same board, making every round a shared, high-stakes vocabulary duel.
The group chat has a leaderboard considering all the matches made on Squabble on that group chat.

IMPORTANT RULES:
1. When a tool returns a message starting with 'DIRECT_MESSAGE_SENT:', respond with exactly 'TOOL_HANDLED' and nothing else.
2. When users reply with numbers, amounts, or phrases like 'no bet' after being asked for a bet amount, interpret these as bet amounts and call squabble_start_game with the betAmount parameter.
3. Examples of bet amount replies: '1', '0.01', 'no bet', '10 $' - all should trigger game creation. The amount must be specificied in $ or USDC or just a number, in the latter case it will be interpreted as USDC. No other tokens!. 
4. If a user provides what looks like a bet amount (number or 'no bet'), always use the squabble_start_game tool.
`.trim();

// Welcome message for new groups (currently commented out in main code)
export const WELCOME_MESSAGE = `
Squabble is a fast-paced, social word game designed for friend group chats on XMTP. 

In each match, 2 to 6 players compete on the same randomized letter grid in real-time, racing against the clock to place or create as many words as possible on the grid. 

The twist? Everyone plays simultaneously on the same board, making every round a shared, high-stakes vocabulary duel.

The group chat has a leaderboard considering all the matches made on Squabble on that group chat. Use @squabble.base.eth or just @squabble to invoke the squabble agent!
`.trim();

// Help hint message
export const HELP_HINT_MESSAGE =
  "👋 Hi! I'm the Squabble game agent. You asked for help! Try to invoke the agent with @squabble.base.eth or just @squabble\n";

// Error messages
export const ERROR_MESSAGES = {
  GENERAL:
    "I encountered an error while processing your request. Please try again later.",
  PROCESSING:
    "Sorry, I encountered an error while processing your request. Please try again later.",
  CONVERSATION_NOT_FOUND: (id: string) =>
    `Could not find conversation for ID: ${id}`,
  AGENT_INIT_FAILED: "Failed to initialize agent:",
} as const;

// Required environment variables
export const REQUIRED_ENV_VARS: string[] = [
  "WALLET_KEY",
  "ENCRYPTION_KEY",
  "XMTP_ENV",
  "CDP_API_KEY_NAME",
  "CDP_API_KEY_PRIVATE_KEY",
  "NETWORK_ID",
  "OPENAI_API_KEY",
  "SQUABBLE_URL",
  "AGENT_SECRET",
];

// API server configuration
export const API_CONFIG = {
  DEFAULT_PORT: 8080,
  HEALTH_ENDPOINT: "/health",
  SEND_MESSAGE_ENDPOINT: "/api/send-message",
} as const;
