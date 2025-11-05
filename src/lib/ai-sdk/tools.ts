import type { Client, Conversation } from "@xmtp/agent-sdk";
import { tool } from "ai";
import { z } from "zod";
import { HELP_HINT_MESSAGE, MIN_BUY_IN_AMOUNT } from "../constants.js";

interface GameCreationResponse {
	id: string;
	[key: string]: unknown;
}

interface LeaderboardPlayer {
	address: string;
	displayName: string;
	username: string;
	points: number;
	wins: number;
	totalGames: number;
	totalWinnings: number;
}

interface LeaderboardResponse {
	leaderboard: LeaderboardPlayer[];
	totalFinishedGames: number;
}

interface LatestGameResponse {
	id: string;
	status: string;
	players: Array<{
		address: string;
		displayName?: string;
		username?: string;
		score?: number;
	}>;
	betAmount?: string;
	winner?: string;
	createdAt?: string;
	[key: string]: unknown;
}

interface SquabbleToolsConfig {
	conversation: Conversation;
	xmtpClient: Client;
	agentInboxId: string;
	squabbleUrl: string;
	agentSecret: string;
}

export const createTools = (config?: SquabbleToolsConfig) => ({
	squabble_start_game: tool({
		description:
			"Start a new Squabble game match. Use this when users want to create or begin a game, or when they provide a buy-in amount.",
		inputSchema: z.object({
			betAmount: z
				.number()
				.optional()
				.nullable()
				.describe(
					"The buy-in amount in USDC. If not provided or 0, it's a free game. Minimum buy-in is 0.5 USDC."
				),
		}),
		execute: async ({ betAmount }) => {
			console.log("[ai-sdk] [start-game-tool] starting game", betAmount);

			if (!config) {
				return {
					text: "❌ Configuration not available. Please try again later.",
				};
			}

			const { conversation, squabbleUrl, agentSecret } = config;
			const buyInAmount = betAmount ?? 0;

			// Validate minimum buy-in
			if (buyInAmount > 0 && buyInAmount < MIN_BUY_IN_AMOUNT) {
				try {
					await conversation.send(
						`❌ The minimum buy-in is ${MIN_BUY_IN_AMOUNT} USDC. Please try to create the game again with a higher amount or say 'no buy-in' if you prefer to play without buying-in.`
					);
					return {
						text: `DIRECT_MESSAGE_SENT: ❌ The minimum buy-in is ${MIN_BUY_IN_AMOUNT} USDC. Please try to create the game again with a higher amount or say 'no buy-in' if you prefer to play without buying-in.`,
					};
				} catch (error) {
					console.error(
						"[ai-sdk] [start-game-tool] Error sending message:",
						error
					);
					return {
						text: `❌ The minimum buy-in amount is ${MIN_BUY_IN_AMOUNT} USDC. Please provide a valid amount.`,
					};
				}
			}

			// Make API call to create game
			try {
				// Convert betAmount to string format that API expects
				const adjustedBetAmount = buyInAmount === 0 ? "0" : String(buyInAmount);
				const requestBody = {
					betAmount: adjustedBetAmount,
					conversationId: conversation.id,
				};

				console.log(
					"[ai-sdk] [start-game-tool] adjustedBetAmount:",
					adjustedBetAmount
				);
				console.log(
					"[ai-sdk] [start-game-tool] conversationId:",
					conversation.id
				);
				console.log("[ai-sdk] [start-game-tool] squabbleUrl:", squabbleUrl);
				console.log("[ai-sdk] [start-game-tool] agentSecret:", agentSecret);
				console.log(
					"[ai-sdk] [start-game-tool] requestBody:",
					JSON.stringify(requestBody)
				);

				const response = await fetch(`${squabbleUrl}/api/agent/create-game`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"x-agent-secret": agentSecret.trim(),
					},
					body: JSON.stringify(requestBody),
				});

				if (!response.ok) {
					const errorText = await response.text();
					console.error("[ai-sdk] [start-game-tool] API error:", errorText);
					try {
						await conversation.send(
							"❌ Failed to create game. Please try again later."
						);
						return {
							text: "DIRECT_MESSAGE_SENT: ❌ Failed to create game. Please try again later.",
						};
					} catch (error) {
						return {
							text: "❌ Failed to create game. Please try again later.",
						};
					}
				}

				const gameData = (await response.json()) as GameCreationResponse;
				const gameUrl = `${squabbleUrl}/games/${gameData.id}`;
				const gameMessage = `🎮 Game created! Good luck! 🍀\n\n${gameUrl}`;

				console.log(
					"[ai-sdk] [start-game-tool] game created successfully:",
					gameData
				);

				// Send the message directly to the conversation
				try {
					await conversation.send(gameMessage);
					return {
						text: `DIRECT_MESSAGE_SENT: ${gameMessage}`,
					};
				} catch (error) {
					console.error(
						"[ai-sdk] [start-game-tool] Error sending message:",
						error
					);
					return {
						text: gameMessage,
					};
				}
			} catch (error) {
				console.error("[ai-sdk] [start-game-tool] API call failed:", error);
				try {
					await conversation.send(
						"❌ Failed to create game. Please try again later."
					);
					return {
						text: "DIRECT_MESSAGE_SENT: ❌ Failed to create game. Please try again later.",
					};
				} catch (sendError) {
					return {
						text: "❌ Failed to create game. Please try again later.",
					};
				}
			}
		},
	}),
	squabble_help: tool({
		description: "Get help and rules for the Squabble game",
		inputSchema: z.object({}),
		execute: async () => {
			console.log("[ai-sdk] [help-tool] providing help");

			if (!config) {
				return {
					text: HELP_HINT_MESSAGE,
				};
			}

			const { conversation } = config;
			const helpMessage = `Hey! I'm Squabble — a fast-paced word game for group chats.

2–6 players. One grid. Total chaos. 🧩

Reply or mention @squabble to play:

→ start game to begin

→ Add a buy-in like "start game 0.5 USDC" if you want to raise the stakes 💸

Let's go! 🔥`;

			try {
				await conversation.send(helpMessage);
				return {
					text: "DIRECT_MESSAGE_SENT: Help message has been sent to the chat.",
				};
			} catch (error) {
				console.error("[ai-sdk] [help-tool] Error sending message:", error);
				return {
					text: helpMessage,
				};
			}
		},
	}),
	squabble_leaderboard: tool({
		description:
			"Show the leaderboard for the current group. Use this when users ask about rankings, scores, or winners.",
		inputSchema: z.object({}),
		execute: async () => {
			console.log("[ai-sdk] [leaderboard-tool] fetching leaderboard");

			if (!config) {
				return {
					text: "❌ Configuration not available. Please try again later.",
				};
			}

			const { conversation, squabbleUrl, agentSecret } = config;
			console.log("[ai-sdk] [leaderboard-tool] squabbleUrl:", squabbleUrl);
			console.log("[ai-sdk] [leaderboard-tool] agentSecret:", agentSecret);
			console.log(
				"[ai-sdk] [leaderboard-tool] conversationId:",
				conversation.id
			);

			try {
				const response = await fetch(
					`${squabbleUrl}/api/agent/leaderboard?conversationId=${encodeURIComponent(
						conversation.id
					)}`,
					{
						method: "GET",
						headers: {
							"Content-Type": "application/json",
							"x-agent-secret": agentSecret.trim(),
						},
					}
				);

				// Check if response is HTML (404 page) instead of JSON
				const contentType = response.headers.get("content-type");
				if (!contentType?.includes("application/json")) {
					const errorText = await response.text();
					console.error(
						"[ai-sdk] [leaderboard-tool] API returned non-JSON response:",
						errorText.substring(0, 200)
					);
					try {
						await conversation.send(
							"❌ Leaderboard endpoint not available. Please try again later."
						);
						return {
							text: "DIRECT_MESSAGE_SENT: ❌ Leaderboard endpoint not available. Please try again later.",
						};
					} catch (error) {
						return {
							text: "❌ Leaderboard endpoint not available. Please try again later.",
						};
					}
				}

				if (!response.ok) {
					const errorText = await response.text();
					console.error("[ai-sdk] [leaderboard-tool] API error:", errorText);

					// Check for specific error about no finished games
					if (
						errorText.includes(
							"No finished games found for this conversation"
						) ||
						errorText.includes("No finished games found")
					) {
						const noGamesMessage =
							"🏆 No games finished yet! Start the first game to see the leaderboard.";
						try {
							await conversation.send(noGamesMessage);
							return {
								text: `DIRECT_MESSAGE_SENT: ${noGamesMessage}`,
							};
						} catch (error) {
							return {
								text: noGamesMessage,
							};
						}
					}

					// Try to parse as JSON to check for error message
					try {
						const errorJson = JSON.parse(errorText);
						if (
							errorJson.error?.includes("No finished games found") ||
							errorJson.message?.includes("No finished games found")
						) {
							const noGamesMessage =
								"🏆 No games finished yet! Start the first game to see the leaderboard.";
							try {
								await conversation.send(noGamesMessage);
								return {
									text: `DIRECT_MESSAGE_SENT: ${noGamesMessage}`,
								};
							} catch (error) {
								return {
									text: noGamesMessage,
								};
							}
						}
					} catch (parseError) {
						// Not JSON, continue with generic error
					}

					// Generic error handling
					try {
						await conversation.send(
							"❌ Failed to fetch leaderboard. Please try again later."
						);
						return {
							text: "DIRECT_MESSAGE_SENT: ❌ Failed to fetch leaderboard. Please try again later.",
						};
					} catch (error) {
						return {
							text: "❌ Failed to fetch leaderboard. Please try again later.",
						};
					}
				}

				const leaderboardData = (await response.json()) as LeaderboardResponse;

				if (
					!leaderboardData.leaderboard ||
					leaderboardData.leaderboard.length === 0
				) {
					const noGamesMessage =
						"🏆 No games finished yet! Start the first game to see the leaderboard.";
					try {
						await conversation.send(noGamesMessage);
						return {
							text: `DIRECT_MESSAGE_SENT: ${noGamesMessage}`,
						};
					} catch (error) {
						return {
							text: noGamesMessage,
						};
					}
				}

				// Format leaderboard message
				let leaderboardMessage = `🏆 Leaderboard (${leaderboardData.totalFinishedGames} finished games)\n\n`;
				leaderboardData.leaderboard.forEach((player, index) => {
					const medal =
						index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : "  ";
					const displayName =
						player.displayName || player.username || "Unknown";
					leaderboardMessage += `${medal} ${index + 1}. ${displayName}\n`;
					leaderboardMessage += `   Points: ${player.points} | Wins: ${player.wins} | Games: ${player.totalGames}`;
					if (player.totalWinnings > 0) {
						leaderboardMessage += ` | Winnings: ${player.totalWinnings} USDC`;
					}
					leaderboardMessage += "\n\n";
				});

				try {
					await conversation.send(leaderboardMessage.trim());
					return {
						text: `DIRECT_MESSAGE_SENT: ${leaderboardMessage.trim()}`,
					};
				} catch (error) {
					console.error(
						"[ai-sdk] [leaderboard-tool] Error sending message:",
						error
					);
					return {
						text: leaderboardMessage.trim(),
					};
				}
			} catch (error) {
				console.error("[ai-sdk] [leaderboard-tool] API call failed:", error);
				try {
					await conversation.send(
						"❌ Failed to fetch leaderboard. Please try again later."
					);
					return {
						text: "DIRECT_MESSAGE_SENT: ❌ Failed to fetch leaderboard. Please try again later.",
					};
				} catch (sendError) {
					return {
						text: "❌ Failed to fetch leaderboard. Please try again later.",
					};
				}
			}
		},
	}),
	squabble_latest_game: tool({
		description:
			"Get information about the latest game in the current group. Use this when users ask about the most recent match.",
		inputSchema: z.object({}),
		execute: async () => {
			console.log("[ai-sdk] [latest-game-tool] fetching latest game");

			if (!config) {
				return {
					text: "❌ Configuration not available. Please try again later.",
				};
			}

			const { conversation, squabbleUrl, agentSecret } = config;

			try {
				let response: Response;
				try {
					response = await fetch(`${squabbleUrl}/api/agent/get-game`, {
						method: "GET",
						headers: {
							"Content-Type": "application/json",
							"x-agent-secret": agentSecret.trim(),
						},
					});
				} catch (error) {
					console.error(
						"[ai-sdk] [latest-game-tool] Error fetching latest game:",
						error
					);
					return {
						text: "❌ Failed to fetch latest game. Please try again later.",
					};
				}

				// Check if response is HTML (404 page) instead of JSON
				const contentType = response.headers.get("content-type");
				if (!contentType?.includes("application/json")) {
					const errorText = await response.text();
					console.error(
						"[ai-sdk] [latest-game-tool] API returned non-JSON response:",
						errorText.substring(0, 200)
					);
					try {
						await conversation.send(
							"❌ Latest game endpoint not available. Please try again later."
						);
						return {
							text: "DIRECT_MESSAGE_SENT: ❌ Latest game endpoint not available. Please try again later.",
						};
					} catch (error) {
						return {
							text: "❌ Latest game endpoint not available. Please try again later.",
						};
					}
				}

				if (!response.ok) {
					const errorText = await response.text();
					console.error("[ai-sdk] [latest-game-tool] API error:", errorText);
					try {
						await conversation.send(
							"❌ Failed to fetch latest game. Please try again later."
						);
						return {
							text: "DIRECT_MESSAGE_SENT: ❌ Failed to fetch latest game. Please try again later.",
						};
					} catch (error) {
						return {
							text: "❌ Failed to fetch latest game. Please try again later.",
						};
					}
				}

				const gameData = (await response.json()) as LatestGameResponse;

				if (!gameData || !gameData.id) {
					const noGameMessage =
						"🎯 No games found yet! Start a game to get started.";
					try {
						await conversation.send(noGameMessage);
						return {
							text: `DIRECT_MESSAGE_SENT: ${noGameMessage}`,
						};
					} catch (error) {
						return {
							text: noGameMessage,
						};
					}
				}

				// Format latest game message based on status
				const gameUrl = `${squabbleUrl}/games/${gameData.id}`;
				const gameStatus = gameData.status?.toUpperCase() || "UNKNOWN";
				let gameMessage: string;

				if (gameStatus === "PENDING") {
					// Message for pending games
					gameMessage = `🎯 Latest Game\n\n`;
					gameMessage += `Status: ${gameData.status}\n`;
					if (gameData.betAmount && gameData.betAmount !== "0") {
						gameMessage += `Buy-in: ${gameData.betAmount} USDC\n`;
					}
					if (gameData.players && gameData.players.length > 0) {
						gameMessage += `Players: ${gameData.players.length}\n`;
						gameData.players.forEach((player) => {
							const name = player.displayName || player.username || "Unknown";
							gameMessage += `  • ${name}\n`;
						});
					}
					gameMessage += `\n${gameUrl}`;
				} else {
					// Message for finished/completed games
					gameMessage = `🎯 Latest Game\n\n`;
					gameMessage += `Status: ${gameData.status || "Unknown"}\n`;
					if (gameData.betAmount && gameData.betAmount !== "0") {
						gameMessage += `Buy-in: ${gameData.betAmount} USDC\n`;
					}
					if (gameData.players && gameData.players.length > 0) {
						gameMessage += `Players: ${gameData.players.length}\n`;
						gameData.players.forEach((player) => {
							const name = player.displayName || player.username || "Unknown";
							const score =
								player.score !== undefined ? ` (${player.score} pts)` : "";
							gameMessage += `  • ${name}${score}\n`;
						});
					}
					if (gameData.winner) {
						gameMessage += `\n🏆 Winner: ${gameData.winner}\n`;
					}
					gameMessage += `\n${gameUrl}`;
				}

				try {
					await conversation.send(gameMessage.trim());
					return {
						text: `DIRECT_MESSAGE_SENT: ${gameMessage.trim()}`,
					};
				} catch (error) {
					console.error(
						"[ai-sdk] [latest-game-tool] Error sending message:",
						error
					);
					return {
						text: gameMessage.trim(),
					};
				}
			} catch (error) {
				console.error("[ai-sdk] [latest-game-tool] API call failed:", error);
				try {
					await conversation.send(
						"❌ Failed to fetch latest game. Please try again later."
					);
					return {
						text: "DIRECT_MESSAGE_SENT: ❌ Failed to fetch latest game. Please try again later.",
					};
				} catch (sendError) {
					return {
						text: "❌ Failed to fetch latest game. Please try again later.",
					};
				}
			}
		},
	}),
});

// Export default tools for backward compatibility
export const tools = createTools();
