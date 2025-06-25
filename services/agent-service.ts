/**
 * Agent Service
 *
 * This module handles the initialization and management of AI agents,
 * including CDP wallet integration and message processing.
 */

import {
  AgentKit,
  cdpApiActionProvider,
  cdpWalletActionProvider,
  CdpWalletProvider,
  erc20ActionProvider,
  walletActionProvider,
} from "@coinbase/agentkit";
import { getLangChainTools } from "@coinbase/agentkit-langchain";
import { HumanMessage } from "@langchain/core/messages";
import { MemorySaver } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import type { Client, Conversation } from "@xmtp/node-sdk";

import { createSquabbleTools } from "../lib/tools/squabble-tools";
import { getWalletData, saveWalletData } from "../lib/utils/storage-utils";
import { SYSTEM_PROMPT, ERROR_MESSAGES } from "../config/constants";

// Type definitions
export interface AgentConfig {
  configurable: {
    thread_id: string;
  };
}

export type Agent = ReturnType<typeof createReactAgent>;

// Global stores for memory and agent instances
const memoryStore: Record<string, MemorySaver> = {};
const agentStore: Record<string, Agent> = {};

/**
 * Environment variables interface for type safety
 */
interface AgentEnvironment {
  CDP_API_KEY_NAME: string;
  CDP_API_KEY_PRIVATE_KEY: string;
  NETWORK_ID: string;
  OPENAI_API_KEY: string;
  SQUABBLE_URL: string;
  AGENT_SECRET: string;
}

/**
 * Initialize an AI agent for a specific user
 *
 * Creates a new agent instance with CDP wallet integration, Squabble tools,
 * and persistent memory. Each user gets their own agent instance and wallet.
 *
 * @param userId - The unique identifier for the user
 * @param conversation - The XMTP conversation instance
 * @param client - The XMTP client instance
 * @param senderWalletAddress - The sender's wallet address
 * @param env - Environment variables object
 * @returns The initialized agent and its configuration
 */
export async function initializeAgent(
  userId: string,
  conversation: Conversation,
  client: Client,
  senderWalletAddress: string,
  env: AgentEnvironment
): Promise<{ agent: Agent; config: AgentConfig }> {
  try {
    // Initialize the language model
    const llm = new ChatOpenAI({
      model: "gpt-4o-mini",
      apiKey: env.OPENAI_API_KEY,
    });

    // Get stored wallet data for this user
    const storedWalletData = getWalletData(userId);

    // Configure CDP wallet
    const config = {
      apiKeyName: env.CDP_API_KEY_NAME,
      apiKeyPrivateKey: env.CDP_API_KEY_PRIVATE_KEY.replace(/\\n/g, "\n"),
      cdpWalletData: storedWalletData || undefined,
      networkId: env.NETWORK_ID || "base-sepolia",
    };

    // Create wallet provider
    const walletProvider = await CdpWalletProvider.configureWithWallet(config);

    // Initialize AgentKit with action providers
    const agentkit = await AgentKit.from({
      walletProvider,
      actionProviders: [
        walletActionProvider(),
        erc20ActionProvider(),
        cdpApiActionProvider({
          apiKeyName: env.CDP_API_KEY_NAME,
          apiKeyPrivateKey: env.CDP_API_KEY_PRIVATE_KEY.replace(/\\n/g, "\n"),
        }),
        cdpWalletActionProvider({
          apiKeyName: env.CDP_API_KEY_NAME,
          apiKeyPrivateKey: env.CDP_API_KEY_PRIVATE_KEY.replace(/\\n/g, "\n"),
        }),
      ],
    });

    // Get LangChain tools from AgentKit
    const tools = await getLangChainTools(agentkit);

    // Add Squabble-specific tools
    const squabbleTools = createSquabbleTools({
      conversation,
      xmtpClient: client,
      senderAddress: userId,
      agentInboxId: client.inboxId,
      squabbleUrl: env.SQUABBLE_URL,
      agentSecret: env.AGENT_SECRET,
    });

    const allTools = [...tools, ...squabbleTools];

    // Create memory for this user
    memoryStore[userId] = new MemorySaver();

    const agentConfig: AgentConfig = {
      configurable: { thread_id: userId },
    };

    // Create the agent with all tools and configuration
    const agent = createReactAgent({
      llm,
      tools: allTools,
      checkpointSaver: memoryStore[userId],
      messageModifier: SYSTEM_PROMPT,
    });

    // Cache the agent for this user
    agentStore[userId] = agent;

    // Export and save wallet data for persistence
    const exportedWallet = await walletProvider.exportWallet();
    const walletDataJson = JSON.stringify(exportedWallet);
    saveWalletData(userId, walletDataJson);

    return { agent, config: agentConfig };
  } catch (error) {
    console.error(ERROR_MESSAGES.AGENT_INIT_FAILED, error);
    throw error;
  }
}

/**
 * Process a message with the AI agent
 *
 * Sends a message to the agent and streams the response back.
 * Handles errors gracefully and returns appropriate error messages.
 *
 * @param agent - The agent instance to process the message
 * @param config - The agent configuration
 * @param message - The message to process
 * @returns The processed response as a string
 */
export async function processMessage(
  agent: Agent,
  config: AgentConfig,
  message: string
): Promise<string> {
  let response = "";

  try {
    // Stream the agent's response
    const stream = await agent.stream(
      { messages: [new HumanMessage(message)] },
      config
    );

    // Collect all chunks of the response
    for await (const chunk of stream) {
      if (chunk && typeof chunk === "object" && "agent" in chunk) {
        const agentChunk = chunk as {
          agent: { messages: Array<{ content: unknown }> };
        };
        response += String(agentChunk.agent.messages[0].content) + "\n";
      }
    }

    return response.trim();
  } catch (error) {
    console.error("Error processing message:", error);
    return ERROR_MESSAGES.PROCESSING;
  }
}
