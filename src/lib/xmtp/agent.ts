import { Agent, filter, type MessageContext } from "@xmtp/agent-sdk";
import type { GroupUpdated } from "@xmtp/content-type-group-updated";
import { GroupUpdatedCodec } from "@xmtp/content-type-group-updated";
import { MarkdownCodec } from "@xmtp/content-type-markdown";
import type { Reaction } from "@xmtp/content-type-reaction";
import { ReactionCodec } from "@xmtp/content-type-reaction";
import type { RemoteAttachment } from "@xmtp/content-type-remote-attachment";
import { RemoteAttachmentCodec } from "@xmtp/content-type-remote-attachment";
import type { Reply } from "@xmtp/content-type-reply";
import { ReplyCodec } from "@xmtp/content-type-reply";
import type { WalletSendCallsParams } from "@xmtp/content-type-wallet-send-calls";
import { WalletSendCallsCodec } from "@xmtp/content-type-wallet-send-calls";
import type {
	ActionsContent,
	IntentContent,
	ThinkingReactionContext,
} from "../../types/index.js";
import { getEncryptionKeyFromString } from "../../utils/index.js";
import { ActionsCodec } from "../../utils/xmtp/actions-codec.js";
import {
	extractMessageContent,
	shouldRespondToMessage,
	shouldSendHelpHint,
} from "../../utils/xmtp/message.util.js";
import { aiGenerateAnswer } from "../ai-sdk/index.js";
import { DM_RESPONSE_MESSAGE, HELP_TOOL_MESSAGE } from "../constants.js";
import { env } from "../env.js";

/**
 * Get the XMTP agent
 * @returns The XMTP agent
 */
export const createXmtpAgent = async () => {
	const dbEncryptionKey = env.XMTP_DB_ENCRYPTION_KEY
		? getEncryptionKeyFromString(env.XMTP_DB_ENCRYPTION_KEY)
		: undefined;
	const customDbPath = (inboxId: string) =>
		`${env.RAILWAY_VOLUME_MOUNT_PATH}/${env.XMTP_ENV}-${inboxId.slice(0, 8)}.db3`;

	return Agent.createFromEnv({
		env: env.XMTP_ENV,
		dbEncryptionKey,
		dbPath: customDbPath,
		codecs: [
			new ReplyCodec(),
			new GroupUpdatedCodec(),
			new WalletSendCallsCodec(),
			new ActionsCodec(),
			new ReactionCodec(),
			new RemoteAttachmentCodec(),
			new MarkdownCodec(),
		],
	});
};

/**
 * Handle XMTP message
 * @param ctx - The message context
 */
export const handleXmtpMessage = async (
	ctx: MessageContext<
		| string
		| IntentContent
		| Reply
		| WalletSendCallsParams
		| ActionsContent
		| GroupUpdated
		| Reaction
		| RemoteAttachment
	>,
	agentAddress: string
) => {
	try {
		const thinkingContext = ctx as ThinkingReactionContext;

		// skip if message has no content or is from the agent or its a reaction
		if (
			!filter.hasContent(ctx.message) ||
			filter.fromSelf(ctx.message, ctx.client) ||
			ctx.message.contentType?.typeId === "reaction"
		) {
			console.log("Skipping message");
			return;
		}

		// Auto-respond to DM messages
		if (ctx.isDm()) {
			console.log("✓ Handling DM message");
			await thinkingContext.helpers.addThinkingEmoji();
			await ctx.sendText(DM_RESPONSE_MESSAGE);
			return;
		}

		// Handle group messages
		if (ctx.isGroup()) {
			const conversationId = ctx.conversation.id;
			console.log(`[xmtp] Handling group message ${conversationId}`);
			// Handle reply to the agent
			const messageContent = extractMessageContent(ctx.message);
			const isSendHelpHint = shouldSendHelpHint(messageContent);
			const shouldRespond = await shouldRespondToMessage({
				message: ctx.message,
				agentInboxId: ctx.client.inboxId,
				agentAddress,
				client: ctx.client,
			});
			if (shouldRespond) {
				await thinkingContext.helpers.addThinkingEmoji();
				if (isSendHelpHint) {
					await ctx.sendTextReply(HELP_TOOL_MESSAGE);
					//const actions = getXmtpActions();
					//await sendActions(ctx, actions);
					return;
				}

				// generate answer with tools
				const { answer, isReply } = await aiGenerateAnswer({
					message: messageContent,
					xmtpContext: ctx,
				});
				if (answer) {
					if (isReply) {
						await ctx.sendTextReply(answer);
					} else {
						await ctx.sendText(answer);
					}
				}
			}
		}
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		console.error("❌ Error processing message:", errorMessage);
	}
};
