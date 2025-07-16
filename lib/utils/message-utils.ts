/**
 * Message Utilities
 *
 * This module contains utility functions for handling XMTP message parsing,
 * content extraction, and message validation logic.
 */

import type { Client, DecodedMessage } from "@xmtp/node-sdk";
import { SQUABBLE_TRIGGERS, BOT_MENTIONS } from "../../config/constants";

/**
 * Check if a message is a reply to the agent
 *
 * @param message - The decoded XMTP message
 * @param agentInboxId - The agent's inbox ID
 * @param client - The XMTP client instance
 * @returns Promise<boolean> - Whether the message is a reply to the agent
 */
export async function isReplyToAgent(
  message: DecodedMessage,
  agentInboxId: string,
  client: Client
): Promise<boolean> {
  // Check if the message is a reply type
  if (message.contentType?.typeId === "reply") {
    console.log("🔧 MESSAGE IS A REPLY");
    try {
      // Check the parameters for the reference message ID
      const messageAny = message as any;
      const parameters = messageAny.parameters;

      if (!parameters || !parameters.reference) {
        return false;
      }

      const referenceMessageId = parameters.reference;

      // Get the conversation to find the referenced message
      const conversation = await client.conversations.getConversationById(
        message.conversationId
      );

      if (!conversation) {
        return false;
      }

      // Get recent messages to find the referenced one
      const messages = await conversation.messages({ limit: 100 });
      const referencedMessage = messages.find(
        (msg) => msg.id === referenceMessageId
      );

      if (!referencedMessage) {
        return false;
      }

      // Check if the referenced message was sent by the agent
      const isReplyToAgent =
        referencedMessage.senderInboxId.toLowerCase() ===
        agentInboxId.toLowerCase();

      return isReplyToAgent;
    } catch (error) {
      return false;
    }
  }
  return false;
}

/**
 * Extract message content from different message types
 *
 * Handles various XMTP message types including replies and regular text messages.
 * For reply messages, it attempts to extract the actual user content from
 * various possible locations in the message structure.
 *
 * @param message - The decoded XMTP message
 * @returns The message content as a string
 */
export function extractMessageContent(message: DecodedMessage): string {
  // Handle reply messages
  if (message.contentType?.typeId === "reply") {
    const messageAny = message as any;
    const replyContent = message.content as any;

    // Check if content is in the main content field
    if (replyContent && typeof replyContent === "object") {
      // Try different possible property names for the actual content
      if (replyContent.content) {
        return String(replyContent.content);
      }
      if (replyContent.text) {
        return String(replyContent.text);
      }
      if (replyContent.message) {
        return String(replyContent.message);
      }
    }

    // Check fallback field (might contain the actual user message)
    if (messageAny.fallback && typeof messageAny.fallback === "string") {
      // Extract the actual user message from the fallback format
      // Format: 'Replied with "actual message" to an earlier message'
      const fallbackText = messageAny.fallback;
      const match = fallbackText.match(
        /Replied with "(.+)" to an earlier message/
      );
      if (match && match[1]) {
        const actualMessage = match[1];
        return actualMessage;
      }

      // If pattern doesn't match, return the full fallback text
      return fallbackText;
    }

    // Check parameters field (might contain reply data)
    if (messageAny.parameters && typeof messageAny.parameters === "object") {
      const params = messageAny.parameters;
      if (params.content) {
        return String(params.content);
      }
      if (params.text) {
        return String(params.text);
      }
    }

    // If content is null/undefined, return empty string to avoid errors
    if (replyContent === null || replyContent === undefined) {
      return "";
    }

    // Fallback to stringifying the whole content if structure is different
    return JSON.stringify(replyContent);
  }

  // Handle regular text messages
  const content = message.content;
  if (content === null || content === undefined) {
    return "";
  }
  return String(content);
}

/**
 * Check if a message should trigger the Squabble agent
 *
 * The agent responds to messages that:
 * 1. Are replies to the agent's previous messages
 * 2. Contain any of the configured trigger keywords/phrases
 *
 * @param message - The decoded XMTP message
 * @param agentInboxId - The agent's inbox ID
 * @param client - The XMTP client instance
 * @returns Promise<boolean> - Whether the agent should respond
 */
export async function shouldRespondToMessage(
  message: DecodedMessage,
  agentInboxId: string,
  client: Client
): Promise<boolean> {
  const messageContent = extractMessageContent(message);

  // Safety check for empty content
  if (!messageContent || messageContent.trim() === "") {
    return false;
  }

  const lowerMessage = messageContent.toLowerCase().trim();

  // If this is a reply to the agent, always process it
  if (await isReplyToAgent(message, agentInboxId, client)) {
    return true;
  }

  // Check if message contains any trigger words/phrases
  const hasTrigger = SQUABBLE_TRIGGERS.some((trigger) =>
    lowerMessage.includes(trigger.toLowerCase())
  );

  return hasTrigger;
}

/**
 * Check if a message should receive a help hint
 *
 * This function checks if users mentioned bot-related keywords but didn't
 * use the proper Squabble triggers, indicating they might need help.
 *
 * @param message - The message content to check
 * @returns boolean - Whether to send a help hint
 */
export function shouldSendHelpHint(message: string): boolean {
  const lowerMessage = message.toLowerCase().trim();

  return (
    BOT_MENTIONS.some((mention) => lowerMessage.includes(mention)) &&
    !SQUABBLE_TRIGGERS.some((trigger) =>
      lowerMessage.includes(trigger.toLowerCase())
    )
  );
}
