import { createOpenAI } from "@ai-sdk/openai";
import type { MessageContext } from "@xmtp/agent-sdk";
import { generateText } from "ai";
import {
	DEFAULT_RESPONSE_MESSAGE,
	HELP_TOOL_MESSAGE,
	SYSTEM_PROMPT,
} from "../constants.js";
import { env } from "../env.js";
import { createTools } from "./tools.js";

const openai = createOpenAI({
	baseURL: "https://api.openai.com/v1",
	name: "openai",
	apiKey: env.OPENAI_API_KEY,
});

/**
 * Generate answer using AI
 * @param message - The message to generate answer for
 * @param messages - The messages to use as context
 * @returns
 */
export const aiGenerateAnswer = async ({
	message,
	xmtpContext,
}: {
	message: string;
	xmtpContext: MessageContext;
}): Promise<{ answer?: string; isReply: boolean }> => {
	// Create tools with full context
	const tools = createTools({
		conversation: xmtpContext.conversation,
		xmtpClient: xmtpContext.client as never,
		agentInboxId: xmtpContext.client.inboxId,
		squabbleUrl: env.SQUABBLE_URL || "",
		agentSecret: env.AGENT_SECRET || "",
	});

	// 1. generate text with ai
	const response = await generateText({
		model: openai("gpt-4.1-mini"),
		system: SYSTEM_PROMPT,
		messages: [{ role: "user", content: message }],
		tools,
	});

	// 2. parse the output
	const outputStep = response.steps[0].content.find(
		(part) => part.type === "tool-result"
	);
	console.log("Output Step:", outputStep);
	if (outputStep) {
		const toolOutput = outputStep.output as { text?: string };
		console.log("Tool Output:", JSON.stringify(toolOutput));
		const outputText = toolOutput?.text ?? response.text;
		console.log("Output Text:", outputText);

		const toolName = outputStep.toolName;
		const toolOutputText = toolOutput?.text || "";

		// Check if tool sent a direct message FIRST (before tool-specific handling)
		if (toolOutputText.startsWith("DIRECT_MESSAGE_SENT:")) {
			console.log(
				"[ai-sdk] Tool sent direct message, no additional response needed"
			);
			return { answer: undefined, isReply: false };
		}

		// Handle tool-specific responses for cases where message wasn't sent directly
		if (toolName === "squabble_start_game") {
			console.log("[ai-sdk] [start-game-tool] game created!!");
			return {
				answer: outputText || "🎮 Game created! Good luck! 🍀",
				isReply: true,
			};
		}
		if (toolName === "squabble_help") {
			console.log("[ai-sdk] [help-tool] help provided!!");
			return { answer: outputText || HELP_TOOL_MESSAGE, isReply: true };
		}
		if (toolName === "squabble_leaderboard") {
			console.log("[ai-sdk] [leaderboard-tool] leaderboard fetched!!");
			return {
				answer: outputText || "Here's the current leaderboard! 🏆",
				isReply: true,
			};
		}
		if (toolName === "squabble_latest_game") {
			console.log("[ai-sdk] [latest-game-tool] latest game fetched!!");
			return {
				answer: outputText || "Here's the latest game information! 🎯",
				isReply: true,
			};
		}

		// Return the tool result text if available
		if (outputText) {
			return { answer: outputText, isReply: true };
		}
		/*
	/*
    // Return the tool result text
    if (outputText) {
      return { answer: outputText, isReply: true };
    }
	*/
		/*
    // Fallback to actions if no text
    const xmtpActions = getXmtpActions({ message: DEFAULT_ACTIONS_MESSAGE });
    await sendActions(xmtpContext, xmtpActions);
    return { answer: undefined, isReply: true };
	*/
	}

	// 3. no tool call, return the text
	return { answer: response.text || DEFAULT_RESPONSE_MESSAGE, isReply: true };
};
