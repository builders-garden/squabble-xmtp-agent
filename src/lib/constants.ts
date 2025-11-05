import { arbitrum, base, mainnet, optimism, polygon } from "viem/chains";

// Storage directory constants
export const STORAGE_CONFIG = {
	XMTP_DIR: ".data/xmtp",
	WALLET_DIR: ".data/wallet",
} as const;

// Network configuration type
export type NetworkConfig = {
	networkId: string;
	networkName: string;
};

// Available network configurations
export const XMTP_NETWORKS: Record<number, NetworkConfig> = {
	[mainnet.id]: {
		networkId: "ethereum-mainnet",
		networkName: "Ethereum",
	},
	[base.id]: {
		networkId: "base-mainnet",
		networkName: "Base",
	},
	[arbitrum.id]: {
		networkId: "arbitrum-mainnet",
		networkName: "Arbitrum",
	},
	[optimism.id]: {
		networkId: "optimism-mainnet",
		networkName: "Optimism",
	},
	[polygon.id]: {
		networkId: "polygon-mainnet",
		networkName: "Polygon",
	},
};

// Agent trigger keywords and commands
export const AGENT_TRIGGERS = ["@squabble", "@squabble.base.eth"] as const;

// Actions message
export const ACTIONS_MESSAGE = `👋 Welcome to Squabble XMTP Agent!

I can help you tracking new users.

Choose an action below:`;

export const DEFAULT_ACTIONS_MESSAGE =
	"Yo, I'm your plug for tracking new users. You can hit me here tagging @squabble. These are the actions you can perform: ";

export const DEFAULT_ACTIONS_MESSAGE_2 =
	"These are the actions you can perform: ";

////////////////////////////////////////////////////////////

// System prompt for the AI agent
export const SYSTEM_PROMPT = `
You are a helpful game assistant for Squabble. Keep responses concise and engaging.
Squabble is a fast-paced, social word game designed for private friend groups on XMTP like the Coinbase Wallet. 
In each match of 2 to 5 minutes, 2 to 6 players compete on the same randomized letter grid in real-time, racing against the clock to place or create as many words as possible on the grid. 
The twist? Everyone plays simultaneously on the same board, making every round a shared, high-stakes vocabulary duel.
The group chat has a leaderboard considering all the matches made on Squabble on that group chat.

IMPORTANT RULES:
1. For messages containing "start game", "create game", "begin game", call squabble_start_game. For "leaderboard", call squabble_leaderboard. For "help" or basic @squabble mentions, call squabble_help, for "latest game" call squabble_latest_game.
2. When users reply with numbers, amounts, or phrases like 'no buy-in' after being asked for a buy-in amount, interpret these as buy-in amounts and call squabble_start_game with the betAmount parameter.
3. Use the word 'buy-in' when asking for a buy-in amount, never use the word 'bet' or 'stake'.
4. Examples of buy-in amount replies: '1', '0.5', 'no buy-in', '10 $' - all should trigger game creation. If the amount is not specified or is 'no buy-in', the amount will be interpreted as 0. The amount must be specificied in $ or USDC or just a number, in the latter case it will be interpreted as USDC. No other tokens!. 
5. If a user provides what looks like a buy-in amount (number or 'no buy-in'), always use the squabble_start_game tool.
6. Always reply if the user replies to the agent.

`.trim();

// DM response message
export const DEFAULT_RESPONSE_MESSAGE =
	`Can't help with that request, but I'm locked in on tracking new users, all day.
`.trim();

// Welcome message for new groups
export const WELCOME_MESSAGE = `
👋 Hey, I’m Squabble - your chaotic little word game bot.

Ready for 2-minute scrabble battles? Here’s how it works:
→ 2–6 players
→ One shared grid
→ Everyone plays at the same time
→ Optional buy-ins
→ Winner takes all  🤑

This group now has its own leaderboard. Bragging rights are officially on the line.

Tag @squabble.base.eth anytime to start a match.

Let the squabbling begin 🧩🔥
`.trim();

// Help hint message
export const HELP_HINT_MESSAGE =
	"👋 Hi! I'm the Squabble game agent. You asked for help! Try to invoke the agent with @squabble.base.eth or just @squabble\n";

// DM response message
export const DM_RESPONSE_MESSAGE = `
👋 Hey! I’m the Squabble agent — your game host for fast, chaotic word battles.

Built for private group chats, I can help you and your friends jump into 3-minute real-time scrabble matches where speed and vocab collide.

Just add @squabble.base.eth to a group and mention me to start a round.
Optional: bring $$ buy-ins if you’re feeling spicy 💸🔥

Let the chaos begin! 🎮🧩
`.trim();

export const HELP_TOOL_MESSAGE =
	`Hey! I'm Squabble — a fast-paced word game for group chats.

2–6 players. One grid. Total chaos. 🧩

Reply or mention @squabble to play:
→ start game to begin
→ Add a buy-in like "start game 0.5 USDC" if you want to raise the stakes 💸

Let's go! 🔥`.trim();

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

// Minimum buy-in amount
export const MIN_BUY_IN_AMOUNT = 0.5;
