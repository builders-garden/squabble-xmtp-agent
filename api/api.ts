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

/**
 * Setup Express API server
 *
 * Creates and configures an Express server with endpoints for:
 * - Health checks
 * - Sending messages to conversations
 * - Listing existing conversations
 * - Broadcasting messages to multiple conversations
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
   * List conversations endpoint
   *
   * Returns a list of existing conversations with optional filtering
   * Supports query parameters:
   * - consentStates: Comma-separated list of consent states (allowed, unknown, denied)
   * - type: Conversation type filter (all, groups, dms)
   * Requires authentication via x-agent-secret header
   */
  app.get("/api/conversations", async (req: any, res: any) => {
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

      // Parse query parameters
      const { consentStates, type } = req.query;

      // Default to allowed conversations only
      let stringConsentFilter = ["allowed"];
      if (consentStates) {
        const states = consentStates
          .split(",")
          .map((s: string) => s.trim().toLowerCase());
        const validStates = states.filter((s: string) =>
          ["allowed", "unknown", "denied"].includes(s)
        );
        if (validStates.length > 0) {
          stringConsentFilter = validStates;
        }
      }

      // Convert string consent states to numeric values
      const numericConsentFilter = mapConsentStates(stringConsentFilter);

      // Determine conversation type to list
      const conversationType = type || "all";
      let conversations;

      switch (conversationType.toLowerCase()) {
        case "groups":
          conversations = await client.conversations.listGroups({
            consentStates: numericConsentFilter,
          });
          break;
        case "dms":
          conversations = await client.conversations.listDms({
            consentStates: numericConsentFilter,
          });
          break;
        case "all":
        default:
          conversations = await client.conversations.list({
            consentStates: numericConsentFilter,
          });
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

      res.json({
        success: true,
        conversations: formattedConversations,
        total: formattedConversations.length,
        filters: {
          consentStates: stringConsentFilter,
          type: conversationType,
        },
      });
    } catch (error) {
      console.error("❌ API Error:", error);
      res.status(500).json({
        error: "Failed to list conversations",
      });
    }
  });

  /**
   * Broadcast message endpoint
   *
   * Sends a message to multiple conversations simultaneously
   * Supports different broadcast strategies:
   * - all: Send to all conversations (filtered by consent states)
   * - selected: Send to specific conversation IDs
   * - type: Send to conversations of a specific type (groups/dms)
   * Requires authentication via x-agent-secret header
   */
  app.post("/api/broadcast", async (req: any, res: any) => {
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
            const conversation = await client.conversations.getConversationById(
              id
            );
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
            targetConversations = await client.conversations.listGroups({
              consentStates: numericConsentFilter,
            });
            break;
          case "dms":
            targetConversations = await client.conversations.listDms({
              consentStates: numericConsentFilter,
            });
            break;
          case "all":
          default:
            targetConversations = await client.conversations.list({
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
      res.json({
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
      res.status(500).json({
        error: "Failed to broadcast message",
      });
    }
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
    console.log(`📋 GET /api/conversations - List existing conversations`);
    console.log(
      `📢 POST /api/broadcast - Broadcast messages to multiple conversations`
    );
    console.log(`❤️  GET ${API_CONFIG.HEALTH_ENDPOINT} - Health check`);
  });

  return app;
}
