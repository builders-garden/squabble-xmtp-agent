import dotenv from "dotenv";
import { isHex } from "viem";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
	// Server
	PORT: z
		.string()
		.refine((val) => !Number.isNaN(Number(val)), {
			message: "PORT must be a number",
		})
		.optional()
		.default("8080"),
	NODE_ENV: z
		.enum(["development", "production"])
		.optional()
		.default("production"),

	// XMTP Agent
	XMTP_ENV: z
		.enum(["dev", "local", "production"])
		.optional()
		.default("production"),
	XMTP_WALLET_KEY: z
		.string()
		.refine((val) => isHex(val), {
			message: "XMTP_WALLET_KEY must be a valid hex string",
		})
		.min(1),
	XMTP_DB_ENCRYPTION_KEY: z.string().optional(),
	// Fix Railway volume mount path
	RAILWAY_VOLUME_MOUNT_PATH: z.string().optional().default("."),

	// OpenAI, get yours at https://platform.openai.com
	OPENAI_API_KEY: z.string().min(1),
	// Squabble API
	SQUABBLE_URL: z.string().min(1).optional(),
	// Squabble Agent Secret
	AGENT_SECRET: z.string().optional(),
	// Receive Agent Secret
	RECEIVE_AGENT_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export const env = envSchema.parse(process.env);
