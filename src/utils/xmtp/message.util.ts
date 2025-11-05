import { type Client, type DecodedMessage } from "@xmtp/agent-sdk";
import type { GroupUpdated } from "@xmtp/content-type-group-updated";
import type { Reaction } from "@xmtp/content-type-reaction";
import type { RemoteAttachment } from "@xmtp/content-type-remote-attachment";
import type { Reply } from "@xmtp/content-type-reply";
import type { WalletSendCallsParams } from "@xmtp/content-type-wallet-send-calls";
import { AGENT_TRIGGERS } from "../../lib/constants.js";
import type { ActionsContent, IntentContent } from "../../types/index.js";

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
	client: Client<
		| string
		| IntentContent
		| Reply
		| WalletSendCallsParams
		| ActionsContent
		| GroupUpdated
		| Reaction
		| RemoteAttachment
	>
): Promise<boolean> {
	// Check if the message is a reply type
	if (message.contentType && message.contentType.typeId === "reply") {
		try {
			// Check the parameters for the reference message ID
			const parameters = message.parameters;

			if (!parameters || !parameters.reference) {
				return false;
			}

			const referenceMessageId = parameters.reference;

			// Get the conversation to find the referenced message
			const conversation = await client.conversations.getConversationById(
				message.conversationId
			);

			if (!conversation) {
				console.error(
					"Conversation not found",
					message.conversationId,
					"on reply to message"
				);
				return false;
			}

			// Get recent messages to find the referenced one
			const messages = await conversation.messages();
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
			console.error(
				"Error checking if message is a reply to the agent:",
				error
			);
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
	if (message.contentType && message.contentType.typeId === "reply") {
		const replyContent = message.content as Reply;

		// Check if content is in the main content field
		if (replyContent && typeof replyContent === "object") {
			// Try different possible property names for the actual content
			if (replyContent.content) {
				return String(replyContent.content);
			}
		}

		// Check fallback field (might contain the actual user message)
		if (message.fallback && typeof message.fallback === "string") {
			// Extract the actual user message from the fallback format
			// Format: 'Replied with "actual message" to an earlier message'
			const fallbackText = message.fallback;
			const match = fallbackText.match(
				/Replied with "(.+)" to an earlier message/
			);
			if (match?.[1]) {
				const actualMessage = match[1];
				return actualMessage;
			}

			// If pattern doesn't match, return the full fallback text
			return fallbackText;
		}

		// Check parameters field (might contain reply data)
		if (message.parameters && typeof message.parameters === "object") {
			const params = message.parameters;
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
 * Detect if text contains a mention of the Squabble agent
 *
 * Handles common variations:
 * - with or without leading '@'
 * - plain handle (squabble) or ENS (squabble.base.eth)
 * - case-insensitive
 * - followed by punctuation
 */
export function containsAgentMention(text: string): boolean {
	const normalized = text.normalize();
	const patterns = [
		/(^|\s)@?squabble(\b|[^a-z0-9_])/i,
		/(^|\s)@?squabble\.base\.eth(\b|[^a-z0-9_])/i,
	];
	return patterns.some((re) => re.test(normalized));
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
export async function shouldRespondToMessage({
	message,
	agentInboxId,
	agentAddress,
	client,
}: {
	message: DecodedMessage;
	agentInboxId: string;
	agentAddress: string;
	client: Client<
		| string
		| IntentContent
		| Reply
		| WalletSendCallsParams
		| ActionsContent
		| GroupUpdated
		| Reaction
		| RemoteAttachment
	>;
}): Promise<boolean> {
	const messageContent = extractMessageContent(message);

	// Safety check for empty content
	if (!messageContent || messageContent.trim() === "") {
		return false;
	}

	const lowerMessage = messageContent.toLowerCase().trim();

	// If this is a reply to the agent, always process it
	const isReply = await isReplyToAgent(message, agentInboxId, client);
	if (isReply) {
		return true;
	}

	// Check if message contains any trigger words/phrases or a mention of the agent
	const hasTrigger = AGENT_TRIGGERS.some((trigger) =>
		lowerMessage.includes(trigger.toLowerCase())
	);
	if (hasTrigger) {
		return true;
	}
	const hasAgentMention = containsAgentMention(messageContent);
	if (hasAgentMention) {
		return true;
	}

	// check if it contains the shortned agent address like this (0x2c3e…69aa)
	const agentAddresses = [
		`${agentAddress.slice(0, 6)}…${agentAddress.slice(-4)}`,
		`${agentAddress.slice(0, 6)}...${agentAddress.slice(-4)}`,
		`${agentAddress.slice(0, 6)}…${agentAddress.slice(-4)}`.toLowerCase(),
		`${agentAddress.slice(0, 6)}...${agentAddress.slice(-4)}`.toLowerCase(),
	];
	const hasShortenedAgentAddress = agentAddresses.some((address) =>
		messageContent.includes(address)
	);
	if (hasShortenedAgentAddress) {
		return true;
	}

	return false;
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

	const isOnlyAgentTrigger = AGENT_TRIGGERS.some(
		(trigger) => lowerMessage === trigger.toLowerCase()
	);
	if (isOnlyAgentTrigger) {
		return true;
	}

	return false;
}
