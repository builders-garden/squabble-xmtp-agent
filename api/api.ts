/**
 * API Server
 *
 * This module sets up an Express server with endpoints for health checks
 * and sending messages to XMTP conversations programmatically.
 */

import express from "express";
import type { Client } from "@xmtp/node-sdk";
import { validateEnvironment } from "../helpers/client";
import { API_CONFIG } from "../config/constants";

/**
 * Setup Express API server
 *
 * Creates and configures an Express server with endpoints for:
 * - Health checks
 * - Sending messages to conversations
 *
 * @param client - The XMTP client instance
 * @returns The configured Express app
 */
export function setupApiServer(client: Client): express.Application {
  const app = express();

  // Parse JSON request bodies
  app.use(express.json());

  // Get required environment variables
  const { RECEIVE_AGENT_SECRET } = validateEnvironment([
    "RECEIVE_AGENT_SECRET",
  ]);

  /**
   * Health check endpoint
   *
   * Simple endpoint to verify the server is running
   */
  app.get(API_CONFIG.HEALTH_ENDPOINT, (req: any, res: any) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * Send message endpoint
   *
   * Allows external services to send messages to specific conversations
   * Requires authentication via x-agent-secret header
   */
  app.post(API_CONFIG.SEND_MESSAGE_ENDPOINT, async (req: any, res: any) => {
    try {
      // Check authentication
      const agentSecret = req.headers["x-agent-secret"];
      const expectedSecret = RECEIVE_AGENT_SECRET;

      if (!expectedSecret) {
        return res.status(500).json({
          error: "Server configuration error: RECEIVE_AGENT_SECRET not set",
        });
      }

      if (!agentSecret || agentSecret !== expectedSecret) {
        return res.status(401).json({
          error: "Unauthorized: Invalid or missing x-agent-secret header",
        });
      }

      // Validate request body
      const { conversationId, message } = req.body;
      console.log("conversationId", conversationId);
      console.log("message", message);

      if (!conversationId || !message) {
        return res.status(400).json({
          error: "conversationId and message are required",
        });
      }

      // Get the conversation
      const conversation = await client.conversations.getConversationById(
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
      res.json({
        success: true,
        message: "Message sent successfully",
        conversationId,
        sentMessage: message,
      });
    } catch (error) {
      console.error("❌ API Error:", error);
      res.status(500).json({
        error: "Failed to send message",
      });
    }
  });

  // Start the server
  const PORT = process.env.PORT || API_CONFIG.DEFAULT_PORT;
  app.listen(PORT, () => {
    console.log(`🚀 API Server running on port ${PORT}`);
    console.log(
      `📡 POST ${API_CONFIG.SEND_MESSAGE_ENDPOINT} - Send messages to conversations`
    );
    console.log(`❤️  GET ${API_CONFIG.HEALTH_ENDPOINT} - Health check`);
  });

  return app;
}
