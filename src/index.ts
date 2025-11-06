import { logDetails } from "@xmtp/agent-sdk/debug";
import cookieParserMiddleware from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morganLogger from "morgan";
import { base } from "viem/chains";
import { env } from "./lib/env.js";
import { createXmtpAgent, handleXmtpMessage } from "./lib/xmtp/agent.js";
import type { RequestWithRawBody } from "./types/index.js";
//import { WELCOME_MESSAGE } from "./lib/constants.js";
import { ConsentState } from "@xmtp/agent-sdk";
import { eyesReactionMiddleware } from "./lib/xmtp/middlewares.js";

/**
 * Convert string consent states to numeric values expected by XMTP SDK
 * @param states - Array of string consent states
 * @returns Array of numeric consent states
 */
function mapConsentStates(states: string[]): number[] {
	const consentStateMap: { [key: string]: number } = {
		allowed: 0,
		denied: 1,
		unknown: 2,
	};

	return states.map((state) => consentStateMap[state.toLowerCase()] ?? 0);
}

async function main() {
	const app = express();
	const port = env.PORT;
	const allowedOrigins = ["*"];
	let server: ReturnType<typeof app.listen> | undefined;

	// Middlewares
	app.use(
		cors({
			origin: allowedOrigins,
			credentials: true,
			methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
		})
	);
	app.use(cookieParserMiddleware());
	app.use(
		express.json({
			verify: (req, _res, buf) => {
				// capture raw body for HMAC verification
				(req as RequestWithRawBody).rawBody = buf.toString("utf8");
			},
		})
	);
	app.use(helmet());
	app.use(morganLogger("dev"));

	app.get("/", (_req, res) => {
		res.json({ status: "ok" });
	});

	app.get("/health", (_req, res) => {
		res.json({
			status: "ok",
			timestamp: new Date().toISOString(),
		});
	});

	console.log("🦊 Squabble XMTP Agent started 🗿");
	console.log(`📡 Connected to: ${base.name}`);

	// Create XMTP Agent
	const xmtpAgent = await createXmtpAgent();

	// XMTP Agent middlewares
	xmtpAgent.use(eyesReactionMiddleware);

	// get agent address
	const agentAddress = xmtpAgent.address;
	if (!agentAddress) {
		console.error("❌ Unable to get xmtp agent address");
		throw new Error("Unable to get xmtp agent address");
	}

	// Get agent secret for API authentication
	const RECEIVE_AGENT_SECRET = env.RECEIVE_AGENT_SECRET;

	// API Endpoints
	/**
	 * List conversations endpoint
	 * GET /api/conversations
	 * Query params: type (all/groups/dms)
	 */
	app.get("/api/conversations", async (req, res) => {
		try {
			// Check authentication
			const agentSecret = req.headers["x-agent-secret"];
			const expectedSecret = RECEIVE_AGENT_SECRET;

			if (!expectedSecret) {
				return res.status(500).json({
					error: "Server configuration error: AGENT_SECRET not set",
				});
			}

			if (!agentSecret || agentSecret !== expectedSecret) {
				return res.status(401).json({
					error: "Unauthorized: Invalid or missing x-agent-secret header",
				});
			}

			// Parse query parameters
			const { type } = req.query;

			// Determine conversation type to list
			const conversationType = type || "all";
			let conversations;

			switch (String(conversationType).toLowerCase()) {
				case "groups":
					conversations = await xmtpAgent.client.conversations.listGroups({
						consentStates: [ConsentState.Allowed],
					});
					console.log("groups", conversations);
					console.log("groups length", conversations.length);
					break;
				case "dms":
					conversations = await xmtpAgent.client.conversations.listDms({
						consentStates: [ConsentState.Allowed],
					});
					break;
				case "all":
				default:
					conversations = await xmtpAgent.client.conversations.list({
						consentStates: [ConsentState.Allowed],
					});
					console.log("all", conversations);
					break;
			}

			// Format response with conversation details
			const formattedConversations = conversations.map((conv: any) => ({
				id: conv.id,
				topic: conv.topic,
				peerAddress: conv.peerAddress,
				createdAt: conv.createdAt,
				consentState: conv.consentState,
				// Include additional properties based on conversation type
				...(conv.groupName && { groupName: conv.groupName }),
				...(conv.groupImageUrl && { groupImageUrl: conv.groupImageUrl }),
				...(conv.groupDescription && {
					groupDescription: conv.groupDescription,
				}),
			}));

			return res.json({
				success: true,
				conversations: formattedConversations,
				total: formattedConversations.length,
				filters: {
					type: conversationType,
				},
			});
		} catch (error) {
			console.error("❌ API Error:", error);
			return res.status(500).json({
				error: "Failed to list conversations",
			});
		}
	});

	/**
	 * Broadcast message endpoint
	 * POST /api/broadcast
	 * Body: { message, conversationIds?, broadcastType?, consentStates? }
	 */
	app.post("/api/broadcast", async (req, res) => {
		try {
			// Check authentication
			const agentSecret = req.headers["x-agent-secret"];
			const expectedSecret = RECEIVE_AGENT_SECRET;

			if (!expectedSecret) {
				return res.status(500).json({
					error: "Server configuration error: AGENT_SECRET not set",
				});
			}

			if (!agentSecret || agentSecret !== expectedSecret) {
				return res.status(401).json({
					error: "Unauthorized: Invalid or missing x-agent-secret header",
				});
			}

			// Validate request body
			const { message, conversationIds, broadcastType, consentStates } =
				req.body;

			if (!message || message.trim() === "") {
				return res.status(400).json({
					error: "message is required and cannot be empty",
				});
			}

			let targetConversations: any[] = [];

			// Determine which conversations to send to
			if (
				conversationIds &&
				Array.isArray(conversationIds) &&
				conversationIds.length > 0
			) {
				// Send to specific conversation IDs
				for (const id of conversationIds) {
					try {
						const conversation =
							await xmtpAgent.client.conversations.getConversationById(id);
						if (conversation) {
							targetConversations.push(conversation);
						}
					} catch (error) {
						console.warn(`⚠️ Conversation ${id} not found or inaccessible`);
					}
				}
			} else {
				// Send to all conversations based on filters
				const consentFilter = consentStates || ["allowed", "unknown", "denied"];
				const numericConsentFilter = mapConsentStates(consentFilter);

				switch (broadcastType?.toLowerCase()) {
					case "groups":
						targetConversations =
							await xmtpAgent.client.conversations.listGroups({
								consentStates: numericConsentFilter,
							});
						break;
					case "dms":
						targetConversations = await xmtpAgent.client.conversations.listDms({
							consentStates: numericConsentFilter,
						});
						break;
					case "all":
					default:
						targetConversations = await xmtpAgent.client.conversations.list({
							consentStates: numericConsentFilter,
						});
						break;
				}
			}

			if (targetConversations.length === 0) {
				return res.status(400).json({
					error: "No conversations found to send messages to",
				});
			}

			// Send messages to all target conversations
			const results: Array<{
				conversationId: string;
				status: string;
				message: string;
			}> = [];
			let successCount = 0;
			let errorCount = 0;

			for (const conversation of targetConversations) {
				try {
					await conversation.send(message);
					results.push({
						conversationId: conversation.id,
						status: "success",
						message: "Message sent successfully",
					});
					successCount++;
				} catch (error) {
					results.push({
						conversationId: conversation.id,
						status: "error",
						message: `Failed to send message: ${
							error instanceof Error ? error.message : String(error)
						}`,
					});
					errorCount++;
					console.error(
						`❌ Failed to send to conversation ${conversation.id}:`,
						error
					);
				}
			}

			// Return summary response
			return res.json({
				success: true,
				message: "Broadcast completed",
				summary: {
					total: targetConversations.length,
					successful: successCount,
					failed: errorCount,
				},
				sentMessage: message,
				results: results,
			});
		} catch (error) {
			console.error("❌ Broadcast API Error:", error);
			return res.status(500).json({
				error: "Failed to broadcast message",
			});
		}
	});

	/**
	 * Send message endpoint
	 * POST /api/send-message
	 * Body: { conversationId, message }
	 */
	app.post("/api/send-message", async (req, res) => {
		try {
			// Check authentication
			const agentSecret = req.headers["x-agent-secret"];
			const expectedSecret = RECEIVE_AGENT_SECRET;

			if (!expectedSecret) {
				return res.status(500).json({
					error: "Server configuration error: AGENT_SECRET not set",
				});
			}

			if (!agentSecret || agentSecret !== expectedSecret) {
				return res.status(401).json({
					error: "Unauthorized: Invalid or missing x-agent-secret header",
				});
			}

			// Validate request body
			const { conversationId, message } = req.body;

			if (!conversationId || !message) {
				return res.status(400).json({
					error: "conversationId and message are required",
				});
			}

			// Get the conversation
			const conversation =
				await xmtpAgent.client.conversations.getConversationById(
					conversationId
				);
			console.log("conversation", conversation);

			if (!conversation) {
				return res.status(404).json({
					error: "Conversation not found",
				});
			}

			// Send the message
			await conversation.send(message);

			// Return success response
			return res.json({
				success: true,
				message: "Message sent successfully",
				conversationId,
				sentMessage: message,
			});
		} catch (error) {
			console.error("❌ API Error:", error);
			return res.status(500).json({
				error: "Failed to send message",
			});
		}
	});

	// XMTP Agent middlewares
	xmtpAgent.on("message", async (ctx) => {
		console.log(`Message received: ${JSON.stringify(ctx.message.content)}`);
		await handleXmtpMessage(ctx, agentAddress);
	});

	//xmtpAgent.on("group", async (ctx) => {
		/*
		console.log("Group received event", JSON.stringify(ctx.conversation));
		const conversationId = ctx.conversation.id;
		const fetchedConversation =
			await xmtpAgent.client.conversations.getConversationById(conversationId);

		if (!fetchedConversation) {
			console.log(
				"❌ CONVERSATION STREAM: Unable to find conversation, skipping"
			);
			return;
		}
		// Check if agent has sent messages before
		const messages = await fetchedConversation.messages();
		const hasSentBefore = messages.some(
			(msg) =>
				msg.senderInboxId.toLowerCase() ===
				xmtpAgent.client.inboxId.toLowerCase()
		);
		if (!hasSentBefore) {
			await fetchedConversation.send(WELCOME_MESSAGE);
		}
		*/
	//});

	xmtpAgent.on("unknownMessage", async (ctx) => {
		console.log(`Unknown message received: ${JSON.stringify(ctx)}`);
		console.log("Unknown message", ctx.message);
	});

	xmtpAgent.on("unhandledError", async (ctx) => {
		console.log(`Unhandled error received: ${JSON.stringify(ctx)}`);
		console.log("Unhandled error", ctx.name);
		console.log("Unhandled error", ctx.message);
		console.log("Unhandled error", ctx.stack);
		
	});

	// Handle startup
	xmtpAgent.on("start", async () => {
		console.log("🦊 Squabble XMTP Agent is running...");
		logDetails(xmtpAgent.client);
	});

	await xmtpAgent.start();

	// Start HTTP server and capture handle for graceful shutdown
	server = app.listen(port, () => {
		console.log(`🚀 Express.js server is running at http://localhost:${port}`);
	});

	// Unified graceful shutdown
	let isShuttingDown = false;
	const shutdown = async (signal: string) => {
		if (isShuttingDown) return;
		isShuttingDown = true;
		console.log(`${signal} received, shutting down...`);

		const tasks: Array<Promise<unknown>> = [];

		// Close HTTP server
		tasks.push(
			new Promise<void>((resolve) => {
				if (!server) return resolve();
				server.close(() => resolve());
			})
		);

		// Stop XMTP Agent
		try {
			tasks.push(xmtpAgent.stop?.() ?? Promise.resolve());
		} catch {}

		await Promise.allSettled(tasks);
		console.log("Shutdown complete. Exiting.");
		setTimeout(() => process.exit(0), 100).unref();
	};

	process.on("SIGINT", () => void shutdown("SIGINT"));
	process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error) => {
	console.error(error);
	throw error;
});
