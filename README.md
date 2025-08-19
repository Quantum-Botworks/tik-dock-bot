# 🚢 Tik Dock

> **Transform your Discord server's TikTok experience with enhanced embeds, community voting, and engagement tracking.**

## 🌟 Features

### 🎵 Enhanced TikTok Integration
- **Smart Link Detection** - Automatically detects and enhances TikTok links
- **Rich Video Cards** - Beautiful embeds with metadata, thumbnails, and engagement stats
- **Original Message Replacement** - Cleans up chat by replacing plain links

### ⭐ Community Engagement
- **5-Star Rating System** - Let your community vote on TikTok content
- **Real-time Vote Tracking** - Live updates of community ratings
- **Points & Rewards** - Gamified system encouraging quality content sharing

### 🏆 Advanced Analytics
- **Multiple Leaderboards** - Track top creators, highest-rated content, and most active members
- **Individual Statistics** - Detailed user profiles with engagement metrics
- **Server-wide Insights** - Monitor overall community engagement trends

### 🎮 Gamification Features
- **Points System** - Earn points for sharing and rating content
- **Achievement Tracking** - Monitor your community impact
- **Engagement Scoring** - Advanced metrics for content quality

### 🚀 Premium Features
- **Video Downloads** *(Coming Soon)* - Save TikTok content locally
- **Custom Playlists** *(Coming Soon)* - Organize content into collections
- **Advanced Moderation** *(Coming Soon)* - Content filtering and approval workflows

## 🛠️ Installation

### Prerequisites
- [Node.js](https://nodejs.org/) (v16 or higher)
- [Discord Bot Token](https://discord.com/developers/applications)
- SQLite3 (included with Node.js)

### Quick Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/Quantum-Botworks/tik-dock-bot.git
   cd tik-dock-bot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your Discord bot token
   ```

4. **Start the bot**
   ```bash
   npm start
   ```

## ⚙️ Configuration

### Required Environment Variables
```env
DISCORD_TOKEN=your_discord_bot_token
```

### Discord Bot Permissions
The bot requires the following permissions:
- Send Messages
- Embed Links
- Read Message History
- Use Slash Commands
- Manage Messages (for link replacement)

### Bot Intents
- Guilds
- Guild Messages
- Message Content
- Guild Members
- Direct Messages

## 📖 Usage

### Automatic TikTok Enhancement
Simply post any TikTok link in a channel where Tik Dock is active. The bot will automatically:
1. Replace your message with an enhanced embed
2. Add voting buttons (1-5 stars)
3. Include quick action buttons (download, playlist, etc.)
4. Award you points for sharing content

### Slash Commands

#### `/leaderboard [type] [range]`
View community engagement leaderboards
- **Types**: `five_stars`, `avg_rating`, `videos_shared`, `points`
- **Range**: Number of top users to display (5-25)

#### `/stats [user]`
Display TikTok engagement statistics for yourself or another user

#### `/playlist [action]`
Manage server TikTok playlists *(Coming Soon)*

### Voting System
Rate any TikTok video from 1-5 stars:
- ⭐ 1-2 Stars: Not great content
- ⭐ 3 Stars: Average/okay content  
- ⭐ 4-5 Stars: Great content worth sharing

## 🏗️ Technical Architecture

### Database Schema
- **Servers**: Trial/subscription management
- **TikTok Interactions**: Video metadata and voting data
- **User Stats**: Points, ratings, and engagement metrics
- **Playlists**: Content organization *(Coming Soon)*

### Built With
- **[Discord.js](https://discord.js.org/)** - Discord API library
- **[SQLite3](https://sqlite.org/)** - Lightweight database
- **[Node-cron](https://github.com/node-cron/node-cron)** - Scheduled tasks
- **[Axios](https://axios-http.com/)** - HTTP client for API calls

## 💰 Subscription Model

### Free Trial
- **Duration**: 10 days
- **Full feature access** during trial period
- **Automatic trial start** when bot joins server

### Pricing Tiers
- **Starter**: $7.99/month (0-1,000 members)
- **Growth**: $29.99/month (1,001-10,000 members)  
- **Enterprise**: $59.99/month (10,000+ members)

## 🤝 Contributing

We welcome contributions! 

### Development Setup
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the GPL v3 License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Email**: quantumbotworks@zohomail.com

---

**Built with ❤️ by [Quantum Botworks](https://github.com/Quantum-Botworks)**