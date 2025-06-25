import { DynamicStructuredTool } from "@langchain/core/tools";
import { ChatOpenAI } from "@langchain/openai";
import type { Client, Conversation } from "@xmtp/node-sdk";
import { z } from "zod";
import { fetchUsersByAddresses } from "../neynar/neynar";

// Types for the tools
interface SquabbleToolsConfig {
  conversation: Conversation;
  xmtpClient: Client;
  senderAddress: string;
  agentInboxId: string;
  squabbleUrl: string;
  agentSecret: string;
}

interface LeaderboardPlayer {
  address: string;
  displayName: string;
  username: string;
  points: number;
  wins: number;
  totalGames: number;
}

interface LeaderboardResponse {
  leaderboard: LeaderboardPlayer[];
  totalFinishedGames: number;
}

interface GameCreationResponse {
  id: string;
  [key: string]: unknown;
}

// Helper function to generate AI responses (you'll need to implement this)
async function generateResponse(prompt: string): Promise<string> {
  try {
    const llm = new ChatOpenAI({
      model: "gpt-4o-mini",
      apiKey: process.env.OPENAI_API_KEY,
    });

    const response = await llm.invoke(prompt);
    return response.content as string;
  } catch (error) {
    console.error("Error generating AI response:", error);
    return "Squabble is a strategic word game where players take turns making moves to capture territory. Use @squabble.base.eth start to begin a new game and @squabble.base.eth leaderboard to see current standings.";
  }
}

export function createSquabbleTools(config: SquabbleToolsConfig) {
  const {
    conversation,
    xmtpClient,
    senderAddress,
    agentInboxId,
    squabbleUrl,
    agentSecret,
  } = config;

  const helpTool = new DynamicStructuredTool({
    name: "squabble_help",
    description: "Get help and rules for the Squabble game",
    schema: z.object({}),
    func: async () => {
      try {
        const rulesPrompt =
          'Generate a concise and engaging explanation of the Squabble game rules. Include that players take turns making moves and the goal is to capture the most territory. Also mention that players can use @squabble.base.eth start to begin a new game and @squabble.base.eth leaderboard to see current standings. Do not use formatting like ** or * when telling the commands, like "@squabble.base.eth help me".';
        const rulesResponse = await generateResponse(rulesPrompt);
        return rulesResponse;
      } catch (error) {
        console.error("❌ TOOL ERROR: squabble_help -", error);
        return "Failed to generate help message. Please try again.";
      }
    },
  });

  const startGameTool = new DynamicStructuredTool({
    name: "squabble_start_game",
    description:
      "Start a new Squabble game with the group members. Call this tool when: 1) User explicitly asks to start a game, 2) User provides a bet amount (like '1', '0.01', 'no bet', '5 ETH'), 3) User replies with what looks like a bet amount after being prompted. If no bet amount is provided in the initial request, ask the user for it.",
    schema: z.object({
      betAmount: z
        .string()
        .nullable()
        .default(null)
        .describe(
          "Bet amount for the game. Can be a number like '1', '0.01', or text like 'no bet', '10 USDC'. If not provided, ask the user for it. The amount must be specified in $ or USDC or just a number, in the latter case it will be interpreted as USDC. No other tokens!. ",
        ),
    }),
    func: async ({ betAmount }) => {
      // If no bet amount is specified, ask for it
      if (!betAmount || betAmount === "null" || betAmount.trim() === "") {
        return "Please specify how much you'd like to bet for this game. You can enter an amount (like '0.01 ETH' or '10 USDC') or say 'no bet' if you prefer to play without betting.";
      }

      try {
        const members = await conversation.members();
        const inboxIds = members
          .map((member) => member.inboxId)
          .filter((id) => id !== agentInboxId);

        // Get addresses for all members
        const memberStates =
          await xmtpClient?.preferences.inboxStateFromInboxIds(inboxIds);
        const memberAddresses = memberStates
          ?.map((state) => state?.recoveryIdentifier?.identifier)
          .filter(Boolean);

        const senderAddress = memberStates?.[0]?.recoveryIdentifier?.identifier;

        const response = await fetch(`${squabbleUrl}/api/agent/create-game`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-agent-secret": agentSecret.trim(),
          },
          body: JSON.stringify({
            betAmount: betAmount,
            conversationId: conversation?.id,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const gameData = await response.json();
        const gameUrl = `${squabbleUrl}/games/${(gameData as GameCreationResponse).id}`;
        const gameMessage = `🎮 Game created! Good luck! 🍀`;

        // Send the first message with game creation announcement
        await conversation.send(gameMessage);

        // Send the second message with just the URL
        await conversation.send(gameUrl);

        // Return a specific signal that indicates direct message was sent
        return "DIRECT_MESSAGE_SENT: Game created successfully and link has been sent to the chat.";
      } catch (error) {
        console.error("❌ TOOL ERROR: squabble_start_game -", error);
        return "❌ Failed to create game. Please try again.";
      }
    },
  });

  const leaderboardTool = new DynamicStructuredTool({
    name: "squabble_leaderboard",
    description: "Show the current Squabble leaderboard for this group chat",
    schema: z.object({}),
    func: async () => {
      try {
        const response = await fetch(
          `${squabbleUrl}/api/agent/leaderboard?conversationId=${conversation?.id}`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              "x-agent-secret": agentSecret.trim(),
            },
          },
        );

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const leaderboardData = await response.json();

        // Create a filtered version for processing
        const filteredLeaderboard = (
          leaderboardData as LeaderboardResponse
        ).leaderboard.map((player) => ({
          address: player.address,
          displayName: player.displayName,
          username: player.username,
          points: player.points,
          wins: player.wins,
          totalGames: player.totalGames,
        }));

        // Sort by points (highest first), then by wins if tied
        filteredLeaderboard.sort((a, b) => {
          if (b.points !== a.points) return b.points - a.points;
          return b.wins - a.wins;
        });

        // Format the leaderboard table directly
        let leaderboardMessage = "🏆 Squabble Leaderboard 🏆\n\n";

        filteredLeaderboard.forEach((player, index) => {
          const rank = index + 1;
          leaderboardMessage += `${rank}. ${player.username} - ${player.points} pts (${player.wins}W/${player.totalGames}G)\n`;
        });

        leaderboardMessage +=
          "\n🎮 Battle for the top spot! Who will claim victory next?";

        return leaderboardMessage;
      } catch (error) {
        console.error("❌ TOOL ERROR: squabble_leaderboard -", error);
        return "❌ Failed to fetch leaderboard. Please try again.";
      }
    },
  });

  const latestGameTool = new DynamicStructuredTool({
    name: "squabble_latest_game",
    description:
      "Get information about the latest Squabble game on this group chat",
    schema: z.object({}),
    func: async () => {
      try {
        const response = await fetch(`${squabbleUrl}/api/agent/get-game`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "x-agent-secret": agentSecret.trim(),
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const gameData = await response.json();
        const gameUrl = `${squabbleUrl}/games/${(gameData as GameCreationResponse).id}`;
        const gameMessage = `🎮 Latest Game:`;

        // Send the first message with latest game announcement
        await conversation.send(gameMessage);

        // Send the second message with just the URL
        await conversation.send(gameUrl);

        // Return a specific signal that indicates direct message was sent
        return "DIRECT_MESSAGE_SENT: Latest game information has been sent to the chat.";
      } catch (error) {
        console.error("❌ TOOL ERROR: squabble_latest_game -", error);
        return "❌ Failed to fetch latest game. Please try again.";
      }
    },
  });

  return [helpTool, startGameTool, leaderboardTool, latestGameTool];
}
