# XMTP Squabble Agent

An AI-powered game assistant for Squabble - a fast-paced, social word game designed for private friend groups on XMTP.

## 🎮 Overview

Squabble is a real-time multiplayer word game where 2-6 players compete on the same randomized letter grid, racing against the clock to create as many words as possible. The agent facilitates game sessions, manages betting with USDC, and maintains persistent leaderboards for group chats.

## ✨ Features

- 🎯 **Real-time Game Management** - Coordinate multiplayer word game sessions
- 💰 **Integrated Betting System** - Support for USDC betting with secure wallet integration
- 🏆 **Persistent Leaderboards** - Track player performance across game sessions
- 🤖 **AI-Powered Assistant** - Intelligent responses powered by OpenAI GPT-4
- 🔐 **Secure Messaging** - Built on XMTP protocol for private, encrypted communications
- 🌐 **REST API** - External integrations and programmatic message sending

## 🏗️ Architecture

### Code Organization

The codebase follows a modular architecture with clear separation of concerns:

```
squabble-agentkit/
├── config/                 # Configuration and constants
│   └── constants.ts        # All app constants, prompts, and config values
├── services/               # Core business logic services
│   ├── agent-service.ts    # AI agent initialization and processing
│   └── xmtp-service.ts     # XMTP client and message handling
├── lib/                    # Utilities and tools
│   ├── utils/
│   │   ├── message-utils.ts    # Message parsing and validation
│   │   └── storage-utils.ts    # Local storage management
│   ├── tools/
│   │   └── squabble-tools.ts   # Game-specific AI tools
│   └── neynar/
│       └── neynar.ts           # Farcaster integration
├── api/                    # REST API endpoints
│   └── api.ts              # Express server and routes
├── helpers/                # Helper functions
│   └── client.ts           # XMTP client utilities
└── index.ts               # Main application entry point
```

### Tech Stack

- **Runtime**: Node.js with TypeScript
- **Messaging**: XMTP Protocol v3
- **AI/ML**: OpenAI GPT-4o-mini with LangChain
- **Blockchain**: Coinbase CDP AgentKit for wallet operations
- **Database**: SQLite (XMTP local storage)
- **API**: Express.js REST API
- **Package Manager**: Yarn

## 🚀 Quick Start

### Prerequisites

- Node.js (v18+ recommended)
- Yarn package manager
- Required API keys (see Environment Variables section)

### Installation

1. **Clone and install dependencies:**

   ```bash
   cd squabble-agentkit
   yarn install
   ```

2. **Configure environment variables:**

   ```bash
   cp .env.example .env
   # Edit .env with your configuration values
   ```

3. **Run the agent:**

   ```bash
   # Development mode with auto-reload
   yarn dev
   # or
   tsx --watch index.ts

   # Production mode
   yarn start
   ```

### Environment Variables

Create a `.env` file with the following required variables:

```bash
# XMTP Configuration
WALLET_KEY=your_wallet_private_key
ENCRYPTION_KEY=your_32_byte_hex_encryption_key
XMTP_ENV=production  # or 'dev' for development

# Coinbase CDP Integration
CDP_API_KEY_NAME=your_cdp_api_key_name
CDP_API_KEY_PRIVATE_KEY=your_cdp_private_key
NETWORK_ID=base-sepolia  # or 'base-mainnet' for production

# AI Configuration
OPENAI_API_KEY=your_openai_api_key

# Squabble Game Server
SQUABBLE_URL=https://your-squabble-server.com
AGENT_SECRET=your_agent_secret_key

# API Security
RECEIVE_AGENT_SECRET=your_api_secret_key
```

## 🎯 Usage

### Triggering the Agent

Users can interact with the agent in XMTP group chats using:

- `@squabble.base.eth` - Full trigger phrase
- `@squabble` - Short trigger phrase

### Available Commands

The agent responds to natural language and supports:

- **Game Management**

  - Start new games with optional betting
  - View current and past game sessions
  - Get game rules and help

- **Leaderboards**

  - View group chat leaderboards
  - Check player statistics
  - Track win/loss records

- **Betting Integration**
  - Place bets in USDC
  - Support for various bet amounts
  - "No bet" option for casual play

### Example Interactions

```
User: "@squabble start a new game"
Agent: "Please specify how much you'd like to bet..."

User: "0.01 USDC"
Agent: "🎮 Game created! Good luck! 🍀"
Agent: "https://squabble.com/games/abc123"

User: "@squabble leaderboard"
Agent: "🏆 Squabble Leaderboard 🏆
1. alice.eth - 150 pts (12W/15G)
2. bob.eth - 120 pts (8W/12G)
..."
```

## 🌐 API Endpoints

### Health Check

```http
GET /health
```

Returns server status and timestamp.

### Send Message

```http
POST /api/send-message
Headers:
  Content-Type: application/json
  x-agent-secret: your_api_secret

Body:
{
  "conversationId": "conversation_id",
  "message": "Hello from external service!"
}
```

### Adding New Features

1. **New Tools**: Add to `lib/tools/` directory
2. **New Services**: Add to `services/` directory
3. **New Utilities**: Add to `lib/utils/` directory
4. **Configuration**: Update `config/constants.ts`

## 🔗 Related Links

- [XMTP Protocol Documentation](https://docs.xmtp.org/)
- [Coinbase CDP AgentKit](https://github.com/coinbase/agentkit)
- [OpenAI API Documentation](https://platform.openai.com/docs)
- [LangChain Documentation](https://langchain.readthedocs.io/)
