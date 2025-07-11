/**
 * XMTP Service
 *
 * This module handles XMTP client initialization, message streaming,
 * and message handling logic for the Squabble agent.
 */

import { Client, Dm } from "@xmtp/node-sdk";
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
  DM_RESPONSE_MESSAGE,
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
      console.log("❌ HANDLER SKIP: Message from bot itself");
      return;
    }

    // Filter out reaction messages
    if (message?.contentType?.typeId === "reaction") {
      console.log("❌ HANDLER SKIP: Reaction message");
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

    // Check if it's a reply message
    const isReply = message.contentType?.typeId === "reply";

    const shouldRespond = await shouldRespondToMessage(
      message,
      client.inboxId,
      client
    );

    if (!shouldRespond) {
      // Check if they mentioned the bot but didn't use proper triggers
      const shouldHint = shouldSendHelpHint(messageContent);

      if (shouldHint) {
        await conversation.send(HELP_HINT_MESSAGE);
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
  } catch (error) {
    console.error("❌ ERROR HANDLING MESSAGE:", error);

    // Send error message to user if conversation is available
    if (conversation) {
      try {
        await conversation.send(ERROR_MESSAGES.GENERAL);
      } catch (sendError) {
        console.error("❌ FAILED TO SEND ERROR MESSAGE:", sendError);
      }
    } else {
      console.log("❌ NO CONVERSATION AVAILABLE FOR ERROR MESSAGE");
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
  // Retry configuration for message stream
  const MAX_RETRIES = 5;
  const RETRY_INTERVAL = 5000;
  let messageStreamRetries = MAX_RETRIES;

  // Stream conversations for welcome messages
  const conversationStream = () => {
    const handleConversation = (
      error: Error | null,
      conversation: Conversation | undefined
    ) => {
      if (error) {
        console.error("❌ CONVERSATION STREAM ERROR:", error);
        return;
      }
      if (!conversation) {
        console.log("⚠️ CONVERSATION STREAM: No conversation received");
        return;
      }

      void (async () => {
        try {
          const fetchedConversation =
            await client.conversations.getConversationById(conversation.id);

          if (!fetchedConversation) {
            console.log(
              "❌ CONVERSATION STREAM: Unable to find conversation, skipping"
            );
            return;
          }

          // Check if it's a group conversation
          const isDm = fetchedConversation instanceof Dm;

          if (isDm) {
            return;
          }

          // Check if agent has sent messages before
          const messages = await fetchedConversation.messages();
          const hasSentBefore = messages.some(
            (msg) =>
              msg.senderInboxId.toLowerCase() === client.inboxId.toLowerCase()
          );

          if (!hasSentBefore) {
            await fetchedConversation.send(WELCOME_MESSAGE);
          } else {
          }
        } catch (error) {
          console.error(
            "❌ CONVERSATION STREAM ERROR sending welcome message:",
            error
          );
        }
      })();
    };

    // @ts-expect-error - TODO: fix this
    void client.conversations.stream(handleConversation);
  };

  // Message stream retry logic
  const retryMessageStream = () => {
    console.log(
      `🔄 Retrying message stream in ${
        RETRY_INTERVAL / 1000
      }s, ${messageStreamRetries} retries left`
    );
    if (messageStreamRetries > 0) {
      messageStreamRetries--;
      setTimeout(() => {
        startMessageStream();
      }, RETRY_INTERVAL);
    } else {
      console.error(
        "❌ Max retries reached for message stream, ending process"
      );
      process.exit(1);
    }
  };

  // Message stream failure handler
  const onMessageStreamFail = () => {
    console.error("❌ Message stream failed");
    retryMessageStream();
  };

  // Message handler for the stream
  const onMessage = (error: Error | null, message?: DecodedMessage) => {
    if (error) {
      console.error("❌ Error in message stream:", error);
      return;
    }
    if (!message) {
      console.log("⚠️ No message received");
      return;
    }

    void (async () => {
      // Skip if the message is from the agent
      if (
        message.senderInboxId.toLowerCase() === client.inboxId.toLowerCase()
      ) {
        return;
      }

      // Skip if the message is not a text message
      if (
        message.contentType?.typeId !== "text" &&
        message.contentType?.typeId !== "reply"
      ) {
        return;
      }

      const conversation = await client.conversations.getConversationById(
        message.conversationId
      );

      if (!conversation) {
        return;
      }
      if (conversation instanceof Dm) {
        await conversation.send(DM_RESPONSE_MESSAGE);
        return;
      }

      // Handle group messages with normal processing
      handleMessage(message, client, env).catch((error) => {
        console.error("❌ Error in message handler:", error);
      });
    })();
  };

  // Start message stream with retry logic
  const startMessageStream = async () => {
    console.log("🔄 Starting message stream...");
    try {
      await client.conversations.sync();
      await client.conversations.streamAllMessages(
        onMessage,
        undefined,
        undefined,
        onMessageStreamFail
      );
      console.log("✅ Message stream started successfully");
    } catch (error) {
      console.error("❌ Failed to start message stream:", error);
      onMessageStreamFail();
    }
  };

  // Run both streams concurrently
  conversationStream();
  startMessageStream();
}
