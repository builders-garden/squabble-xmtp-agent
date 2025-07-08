/**
 * XMTP Service
 *
 * This module handles XMTP client initialization, message streaming,
 * and message handling logic for the Squabble agent.
 */

import { Client } from "@xmtp/node-sdk";
import type { Conversation, DecodedMessage, XmtpEnv } from "@xmtp/node-sdk";
import {
  createSigner,
  getDbPath,
  getEncryptionKeyFromHex,
  logAgentDetails,
} from "../helpers/client";
import {
  extractMessageContent,
  shouldRespondToMessage,
  shouldSendHelpHint,
} from "../lib/utils/message-utils";
import { initializeAgent, processMessage } from "./agent-service";
import {
  ERROR_MESSAGES,
  HELP_HINT_MESSAGE,
  WELCOME_MESSAGE,
} from "../config/constants";

/**
 * Environment variables interface for XMTP service
 */
interface XmtpEnvironment {
  WALLET_KEY: string;
  ENCRYPTION_KEY: string;
  XMTP_ENV: string;
  CDP_API_KEY_NAME: string;
  CDP_API_KEY_PRIVATE_KEY: string;
  NETWORK_ID: string;
  OPENAI_API_KEY: string;
  SQUABBLE_URL: string;
  AGENT_SECRET: string;
}

/**
 * Initialize the XMTP client
 *
 * Creates and configures an XMTP client with the provided wallet key
 * and encryption settings. Also syncs conversations from the network.
 *
 * @param env - Environment variables object
 * @returns An initialized XMTP Client instance
 */
export async function initializeXmtpClient(
  env: XmtpEnvironment
): Promise<Client> {
  // Create signer from wallet key
  const signer = createSigner(env.WALLET_KEY);
  const dbEncryptionKey = getEncryptionKeyFromHex(env.ENCRYPTION_KEY);

  // Get the wallet identifier
  const identifier = await signer.getIdentifier();
  const address = identifier.identifier;

  // Create XMTP client
  const client = await Client.create(signer, {
    dbEncryptionKey,
    env: env.XMTP_ENV as XmtpEnv,
    dbPath: getDbPath(env.XMTP_ENV),
  });

  // Log agent details
  void logAgentDetails(client);

  // Sync conversations from network
  console.log("✓ Syncing conversations...");
  console.log(`📝 Agent Inbox ID:`, client.inboxId);
  await client.conversations.sync();

  return client;
}

/**
 * Handle incoming XMTP messages
 *
 * Processes incoming messages and determines whether the agent should respond.
 * Handles message extraction, agent initialization, and response sending.
 *
 * @param message - The decoded XMTP message
 * @param client - The XMTP client instance
 * @param env - Environment variables object
 */
export async function handleMessage(
  message: DecodedMessage,
  client: Client,
  env: XmtpEnvironment
): Promise<void> {
  let conversation: Conversation | null = null;

  try {
    const senderAddress = message.senderInboxId;
    const botAddress = client.inboxId.toLowerCase();

    // Ignore messages from the bot itself
    if (senderAddress.toLowerCase() === botAddress) {
      return;
    }

    // Filter out reaction messages
    if (message?.contentType?.typeId === "reaction") {
      return;
    }

    // Get the conversation
    conversation = (await client.conversations.getConversationById(
      message.conversationId
    )) as Conversation | null;

    if (!conversation) {
      throw new Error(
        ERROR_MESSAGES.CONVERSATION_NOT_FOUND(message.conversationId)
      );
    }

    // Extract message content
    const messageContent = extractMessageContent(message);
    console.log(
      `NEW MESSAGE RECEIVED: ${messageContent} from ${senderAddress}`
    );

    // Check if message should trigger the Squabble agent
    if (!(await shouldRespondToMessage(message, client.inboxId, client))) {
      // Check if they mentioned the bot but didn't use proper triggers
      if (shouldSendHelpHint(messageContent)) {
        await conversation.send(HELP_HINT_MESSAGE);
        console.log(
          `NEW MESSAGE SENT: ${HELP_HINT_MESSAGE} to ${senderAddress}`
        );
      }
      return;
    }

    // Get the sender's wallet address
    const senderInboxState = await client.preferences.inboxStateFromInboxIds([
      senderAddress,
    ]);
    const senderWalletAddress =
      senderInboxState?.[0]?.recoveryIdentifier?.identifier;

    // Initialize agent for this user
    const { agent, config } = await initializeAgent(
      senderAddress,
      conversation,
      client,
      senderWalletAddress,
      env
    );

    // Process the message with the agent
    const response = await processMessage(agent, config, messageContent);

    // Don't send "TOOL_HANDLED" responses - these indicate tools have already sent direct messages
    if (response.trim() === "TOOL_HANDLED") {
      return;
    }

    // Send the response
    await conversation.send(response);
    console.log(`NEW MESSAGE SENT: ${response} to ${senderAddress}`);
  } catch (error) {
    console.error("Error handling message:", error);

    // Send error message to user if conversation is available
    if (conversation) {
      try {
        await conversation.send(ERROR_MESSAGES.GENERAL);
        console.log(
          `NEW MESSAGE SENT: ${ERROR_MESSAGES.GENERAL} to ${message.senderInboxId}`
        );
      } catch (sendError) {
        console.error("Failed to send error message:", sendError);
      }
    }
  }
}

/**
 * Start listening for XMTP messages and new group conversations
 *
 * Sets up both a message stream to listen for incoming messages and a conversation
 * stream to detect when the agent is added to new groups.
 *
 * @param client - The XMTP client instance
 * @param env - Environment variables object
 */
export async function startMessageListener(
  client: Client,
  env: XmtpEnvironment
): Promise<void> {
  console.log("🎧 Starting message listener...");

  // Stream conversations for welcome messages
  const conversationStream = () => {
    console.log("🔄 Waiting for new conversations...");
    const handleConversation = (
      error: Error | null,
      conversation: Conversation | undefined
    ) => {
      if (error) {
        console.error("Error in conversation stream:", error);
        return;
      }
      if (!conversation) {
        console.log("No conversation received");
        return;
      }

      void (async () => {
        try {
          const fetchedConversation =
            await client.conversations.getConversationById(conversation.id);

          if (!fetchedConversation) {
            console.log("Unable to find conversation, skipping");
            return;
          }

          // Check if it's a group conversation
          const isDm = fetchedConversation.constructor.name === "Dm";
          if (isDm) {
            console.log("Skipping DM conversation");
            return;
          }

          console.log(
            `🎉 New group conversation found: ${fetchedConversation.id}`
          );

          // Check if agent has sent messages before
          const messages = await fetchedConversation.messages();
          const hasSentBefore = messages.some(
            (msg) =>
              msg.senderInboxId.toLowerCase() === client.inboxId.toLowerCase()
          );

          if (!hasSentBefore) {
            await fetchedConversation.send(WELCOME_MESSAGE);
            console.log(`NEW MESSAGE SENT: ${WELCOME_MESSAGE} to new group`);
          }
        } catch (error) {
          console.error("Error sending welcome message:", error);
        }
      })();
    };

    // @ts-expect-error - TODO: fix this
    void client.conversations.stream(handleConversation);
  };

  // Stream all messages for processing
  const messageStream = () => {
    console.log("🔄 Waiting for messages...");
    void client.conversations.streamAllMessages((error, message) => {
      if (error) {
        console.error("Error in message stream:", error);
        return;
      }
      if (!message) {
        console.log("No message received");
        return;
      }

      // Handle message in background to avoid blocking the stream
      handleMessage(message, client, env).catch((error) => {
        console.error("Error in message handler:", error);
      });
    });
  };

  // Run both streams concurrently
  conversationStream();
  messageStream();

  console.log(
    "✅ Message listener started with conversation and message streams"
  );
}
