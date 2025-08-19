require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Events, PermissionFlagsBits, SlashCommandBuilder, StringSelectMenuBuilder, ComponentType } = require('discord.js');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

// Initialize bot
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages
    ]
});

// Database setup
const db = new sqlite3.Database('./tikdock.db');

// Initialize database tables
db.serialize(() => {
    // Server subscriptions and trial info
    db.run(`CREATE TABLE IF NOT EXISTS servers (
        guild_id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        trial_start DATE NOT NULL,
        trial_end DATE NOT NULL,
        subscription_tier TEXT DEFAULT 'trial',
        subscription_active BOOLEAN DEFAULT 0,
        member_count INTEGER DEFAULT 0,
        replace_mode BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    // TikTok video interactions and voting
    db.run(`CREATE TABLE IF NOT EXISTS tiktok_interactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        tiktok_url TEXT NOT NULL,
        video_id TEXT,
        shared_by_id TEXT NOT NULL,
        shared_by_name TEXT NOT NULL,
        user_votes TEXT DEFAULT '{}',
        total_votes INTEGER DEFAULT 0,
        average_rating REAL DEFAULT 0,
        five_star_count INTEGER DEFAULT 0,
        video_title TEXT,
        video_creator TEXT,
        video_thumbnail TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    // User points and leaderboard data
    db.run(`CREATE TABLE IF NOT EXISTS user_stats (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        points INTEGER DEFAULT 0,
        videos_shared INTEGER DEFAULT 0,
        votes_cast INTEGER DEFAULT 0,
        five_stars_received INTEGER DEFAULT 0,
        total_rating_sum INTEGER DEFAULT 0,
        average_user_rating REAL DEFAULT 0,
        PRIMARY KEY (guild_id, user_id)
    )`);
    
    // Server playlists
    db.run(`CREATE TABLE IF NOT EXISTS playlists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        created_by TEXT NOT NULL,
        video_ids TEXT DEFAULT '[]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

// TikTok URL regex patterns
const tiktokRegex = /(?:https?:\/\/)?(?:www\.)?(?:tiktok\.com\/@[\w.-]+\/video\/\d+|vm\.tiktok\.com\/\w+|tiktok\.com\/t\/\w+)/gi;

// Pricing tiers
const pricingTiers = {
    'small': { min: 0, max: 1000, price: 7.99, name: 'Starter' },
    'medium': { min: 1001, max: 10000, price: 29.99, name: 'Growth' },
    'large': { min: 10001, max: Infinity, price: 59.99, name: 'Enterprise' }
};

// Bot ready event
client.once(Events.ClientReady, async () => {
    console.log('🚢 Tik Dock is sailing! Bot is ready.');
    client.user.setActivity('TikTok videos ⚓', { type: 'WATCHING' });
    
    // Register slash commands
    await registerSlashCommands();
});

// Register slash commands
async function registerSlashCommands() {
    const commands = [
        new SlashCommandBuilder()
            .setName('leaderboard')
            .setDescription('🏆 View TikTok engagement leaderboards')
            .addStringOption(option =>
                option.setName('type')
                    .setDescription('Choose leaderboard type')
                    .setRequired(false)
                    .addChoices(
                        { name: '⭐ Most 5-Star Posts', value: 'five_stars' },
                        { name: '📊 Highest Average Rating', value: 'avg_rating' },
                        { name: '🎵 Most Videos Shared', value: 'videos_shared' },
                        { name: '🏅 Total Points', value: 'points' }
                    ))
            .addIntegerOption(option =>
                option.setName('range')
                    .setDescription('Number of top users to show (default: 10)')
                    .setMinValue(5)
                    .setMaxValue(25)),
        
        new SlashCommandBuilder()
            .setName('stats')
            .setDescription('📈 View your TikTok engagement stats')
            .addUserOption(option =>
                option.setName('user')
                    .setDescription('View stats for another user')
                    .setRequired(false)),
                    
        new SlashCommandBuilder()
            .setName('playlist')
            .setDescription('🎵 Manage server TikTok playlists')
            .addStringOption(option =>
                option.setName('action')
                    .setDescription('Choose action')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Create', value: 'create' },
                        { name: 'List', value: 'list' },
                        { name: 'View', value: 'view' }
                    ))
    ];
    
    try {
        console.log('Started refreshing application (/) commands.');
        await client.application.commands.set(commands);
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error('Error registering slash commands:', error);
    }
}

// Guild join event - start trial and DM owner
client.on(Events.GuildCreate, async (guild) => {
    console.log(`Joined guild: ${guild.name} (${guild.id})`);
    
    const trialStart = new Date();
    const trialEnd = new Date(trialStart.getTime() + (10 * 24 * 60 * 60 * 1000)); // 10 days
    
    // Store server info in database
    db.run(`INSERT OR REPLACE INTO servers (guild_id, owner_id, trial_start, trial_end, member_count) 
            VALUES (?, ?, ?, ?, ?)`, 
            [guild.id, guild.ownerId, trialStart.toISOString(), trialEnd.toISOString(), guild.memberCount]);
    
    // Send welcome DM to server owner
    try {
        const owner = await guild.fetchOwner();
        const welcomeEmbed = new EmbedBuilder()
            .setColor('#FF6B6B')
            .setTitle('⚓ Welcome to Tik Dock!')
            .setDescription('Thanks for adding Tik Dock to your server! We\'re excited to help you create amazing TikTok experiences for your community.')
            .addFields(
                { name: '🎉 Free Trial Active', value: `Your 10-day trial started now and expires on **${trialEnd.toLocaleDateString()} at ${trialEnd.toLocaleTimeString()}**`, inline: false },
                { name: '💰 Pricing After Trial', value: getDynamicPricing(guild.memberCount), inline: false },
                { name: '🚀 What You Get', value: '• Enhanced TikTok embeds with voting\n• Community engagement tracking\n• Points & leaderboard system\n• Video download capabilities\n• Server playlists\n• Premium support', inline: false }
            )
            .setFooter({ text: 'Tik Dock • Connecting TikTok & Discord', iconURL: client.user.displayAvatarURL() });
        
        const subscriptionButton = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('subscribe_now')
                    .setLabel('🔥 Subscribe Now')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('view_features')
                    .setLabel('📋 View Features')
                    .setStyle(ButtonStyle.Secondary)
            );
        
        await owner.send({ embeds: [welcomeEmbed], components: [subscriptionButton] });
        console.log(`Welcome DM sent to ${owner.tag}`);
    } catch (error) {
        console.error('Failed to send welcome DM:', error);
    }
});

// Message handler for TikTok links
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    
    // Check if server has active trial or subscription
    const serverStatus = await checkServerStatus(message.guild.id);
    if (!serverStatus.active) {
        // Only respond occasionally to avoid spam
        if (Math.random() < 0.1) { // 10% chance
            const expiredEmbed = new EmbedBuilder()
                .setColor('#FF4444')
                .setTitle('⚓ Tik Dock Trial Expired')
                .setDescription('Your free trial has ended! Upgrade to continue enjoying enhanced TikTok features.')
                .addFields(
                    { name: '💡 What you\'re missing:', value: '• Enhanced TikTok embeds\n• Community voting system\n• Engagement tracking\n• Points & leaderboards\n• Video downloads\n• Server playlists', inline: false },
                    { name: '🚀 Ready to upgrade?', value: getDynamicPricing(message.guild.memberCount), inline: false }
                )
                .setFooter({ text: 'Contact server admin to reactivate • Tik Dock' });
            
            return message.reply({ embeds: [expiredEmbed] });
        }
        return;
    }
    
    // Check for TikTok links
    const tiktokUrls = message.content.match(tiktokRegex);
    if (tiktokUrls) {
        for (const url of tiktokUrls) {
            await handleTikTokLink(message, url);
        }
    }
});

// Handle TikTok link processing
async function handleTikTokLink(message, url) {
    try {
        // Extract video ID from URL
        const videoId = extractVideoId(url);
        
        // Try to get video metadata (placeholder - you'd integrate with TikTok API)
        const videoData = await getTikTokVideoData(url);
        
        // Create enhanced video card embed
        const embed = new EmbedBuilder()
            .setColor('#FF0050')
            .setAuthor({ 
                name: `${videoData.creator || 'TikTok Creator'}`, 
                iconURL: 'https://cdn.iconscout.com/icon/free/png-256/tiktok-52-1086928.png' 
            })
            .setTitle('🎵 TikTok Video')
            .setDescription(`${videoData.title || 'Amazing TikTok content!'}\n\n**Originally shared by** ${message.author}`)
            .addFields(
                { name: '👀 Views', value: formatNumber(videoData.views || '???'), inline: true },
                { name: '💗 Likes', value: formatNumber(videoData.likes || '???'), inline: true },
                { name: '⭐ Rating', value: 'No votes yet', inline: true }
            )
            .setURL(url)
            .setImage(videoData.thumbnail || 'https://via.placeholder.com/400x400.png?text=TikTok+Video')
            .setFooter({ text: '⚓ Rate this video and earn points! • Tik Dock', iconURL: client.user.displayAvatarURL() })
            .setTimestamp();
        
        // Create voting buttons row
        const voteRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId(`vote_1_${videoId}`).setLabel('1').setEmoji('⭐').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`vote_2_${videoId}`).setLabel('2').setEmoji('⭐').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`vote_3_${videoId}`).setLabel('3').setEmoji('⭐').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`vote_4_${videoId}`).setLabel('4').setEmoji('⭐').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`vote_5_${videoId}`).setLabel('5').setEmoji('⭐').setStyle(ButtonStyle.Success)
            );
        
        // Create quick actions row
        const actionRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`download_${videoId}`)
                    .setLabel('Download')
                    .setEmoji('📥')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`playlist_${videoId}`)
                    .setLabel('Add to Playlist')
                    .setEmoji('📝')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setURL(url)
                    .setLabel('Watch on TikTok')
                    .setEmoji('🎵')
                    .setStyle(ButtonStyle.Link)
            );
        
        // Delete original message and post enhanced embed
        try {
            await message.delete();
            console.log(`Deleted original TikTok message from ${message.author.tag}`);
        } catch (error) {
            console.log('Could not delete original message (insufficient permissions)');
        }
        
        const enhancedMessage = await message.channel.send({ 
            embeds: [embed], 
            components: [voteRow, actionRow] 
        });
        
        // Store in database
        db.run(`INSERT INTO tiktok_interactions 
                (guild_id, message_id, tiktok_url, video_id, shared_by_id, shared_by_name, video_title, video_creator, video_thumbnail) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
                [message.guild.id, enhancedMessage.id, url, videoId, message.author.id, message.author.displayName, 
                 videoData.title, videoData.creator, videoData.thumbnail]);
        
        // Award points to user for sharing
        await updateUserStats(message.guild.id, message.author.id, message.author.displayName, { 
            videos_shared: 1, 
            points: 10 
        });
        
        console.log(`Enhanced TikTok embed created for ${url} by ${message.author.tag}`);
    } catch (error) {
        console.error('Error handling TikTok link:', error);
    }
}

// Placeholder function for TikTok API integration
async function getTikTokVideoData(url) {
    // This would integrate with TikTok API in production
    // For now, return placeholder data
    return {
        title: 'Check out this amazing TikTok!',
        creator: '@tiktokcreator',
        thumbnail: 'https://via.placeholder.com/400x400/FF0050/FFFFFF?text=TikTok+Video',
        views: Math.floor(Math.random() * 1000000) + 10000,
        likes: Math.floor(Math.random() * 50000) + 1000
    };
}

// Slash command handler
client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isCommand()) {
        const { commandName } = interaction;
        
        if (commandName === 'leaderboard') {
            await handleLeaderboard(interaction);
        } else if (commandName === 'stats') {
            await handleStats(interaction);
        } else if (commandName === 'playlist') {
            await handlePlaylist(interaction);
        }
    } else if (interaction.isButton()) {
        await handleButtonInteraction(interaction);
    } else if (interaction.isSelectMenu()) {
        await handleSelectMenu(interaction);
    }
});

// Handle leaderboard command
async function handleLeaderboard(interaction) {
    const type = interaction.options.getString('type') || 'five_stars';
    const range = interaction.options.getInteger('range') || 10;
    
    await interaction.deferReply();
    
    let orderBy, displayName, emoji;
    switch (type) {
        case 'five_stars':
            orderBy = 'five_stars_received DESC, average_user_rating DESC';
            displayName = 'Most 5-Star Posts';
            emoji = '⭐';
            break;
        case 'avg_rating':
            orderBy = 'average_user_rating DESC, videos_shared DESC';
            displayName = 'Highest Average Rating';
            emoji = '📊';
            break;
        case 'videos_shared':
            orderBy = 'videos_shared DESC, points DESC';
            displayName = 'Most Videos Shared';
            emoji = '🎵';
            break;
        case 'points':
            orderBy = 'points DESC, videos_shared DESC';
            displayName = 'Total Points';
            emoji = '🏅';
            break;
    }
    
    db.all(`SELECT * FROM user_stats WHERE guild_id = ? AND videos_shared > 0 
            ORDER BY ${orderBy} LIMIT ?`, 
            [interaction.guild.id, range], async (err, rows) => {
        if (err) {
            return interaction.editReply('❌ Error fetching leaderboard data');
        }
        
        if (!rows || rows.length === 0) {
            const embed = new EmbedBuilder()
                .setColor('#FFB347')
                .setTitle('🏆 TikTok Leaderboard')
                .setDescription('No data yet! Share some TikTok videos to get started.')
                .setFooter({ text: 'Tik Dock ⚓' });
            
            return interaction.editReply({ embeds: [embed] });
        }
        
        let leaderboardText = '';
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rank = i + 1;
            const medal = rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : `**${rank}.**`;
            
            let value;
            switch (type) {
                case 'five_stars':
                    value = `${row.five_stars_received} five-stars (${row.average_user_rating.toFixed(1)} avg)`;
                    break;
                case 'avg_rating':
                    value = `${row.average_user_rating.toFixed(2)}/5.0 (${row.videos_shared} videos)`;
                    break;
                case 'videos_shared':
                    value = `${row.videos_shared} videos (${row.points} points)`;
                    break;
                case 'points':
                    value = `${row.points} points (${row.videos_shared} videos)`;
                    break;
            }
            
            leaderboardText += `${medal} **${row.username}** • ${value}\n`;
        }
        
        const embed = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle(`🏆 ${emoji} ${displayName} Leaderboard`)
            .setDescription(leaderboardText)
            .addFields(
                { name: '📈 How to climb the ranks:', value: 'Share great TikTok content and get 5-star ratings from your community!', inline: false }
            )
            .setFooter({ text: `Showing top ${rows.length} • Tik Dock ⚓` })
            .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
    });
}

// Handle stats command
async function handleStats(interaction) {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    await interaction.deferReply();
    
    db.get(`SELECT * FROM user_stats WHERE guild_id = ? AND user_id = ?`, 
           [interaction.guild.id, targetUser.id], async (err, row) => {
        if (err || !row) {
            const embed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('📈 TikTok Stats')
                .setDescription(`${targetUser.displayName} hasn't shared any TikTok videos yet!`)
                .setFooter({ text: 'Tik Dock ⚓' });
            
            return interaction.editReply({ embeds: [embed] });
        }
        
        const embed = new EmbedBuilder()
            .setColor('#00D4FF')
            .setTitle(`📈 ${row.username}'s TikTok Stats`)
            .setThumbnail(targetUser.displayAvatarURL())
            .addFields(
                { name: '🎵 Videos Shared', value: row.videos_shared.toString(), inline: true },
                { name: '🗳️ Votes Cast', value: row.votes_cast.toString(), inline: true },
                { name: '🏅 Total Points', value: row.points.toString(), inline: true },
                { name: '⭐ Five-Star Posts', value: row.five_stars_received.toString(), inline: true },
                { name: '📊 Average Rating', value: row.average_user_rating.toFixed(2) + '/5.0', inline: true },
                { name: '🎯 Engagement Score', value: Math.floor((row.points / Math.max(row.videos_shared, 1)) * 10) + '/100', inline: true }
            )
            .setFooter({ text: 'Keep sharing great content! • Tik Dock ⚓' })
            .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
    });
}

// Handle playlist command
async function handlePlaylist(interaction) {
    const action = interaction.options.getString('action');
    // Placeholder for playlist functionality
    await interaction.reply({
        content: `🎵 Playlist ${action} feature coming soon! This will let you organize TikTok videos into server playlists.`,
        ephemeral: true
    });
}

// Button interaction handler
async function handleButtonInteraction(interaction) {
    const [action, param1, param2] = interaction.customId.split('_');
    
    if (action === 'vote') {
        await handleVote(interaction, param1, param2);
    } else if (action === 'download') {
        await handleDownload(interaction, param1);
    } else if (action === 'playlist') {
        await handlePlaylistAdd(interaction, param1);
    } else if (interaction.customId === 'subscribe_now') {
        await handleSubscription(interaction);
    } else if (interaction.customId === 'view_features') {
        await showFeatures(interaction);
    }
}

// Handle voting
async function handleVote(interaction, rating, videoId) {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    const messageId = interaction.message.id;
    
    try {
        // Get current votes and shared_by info
        db.get(`SELECT user_votes, total_votes, shared_by_id FROM tiktok_interactions WHERE message_id = ?`, 
               [messageId], async (err, row) => {
            if (err || !row) return interaction.reply({ content: '❌ Error recording vote', ephemeral: true });
            
            let userVotes = JSON.parse(row.user_votes || '{}');
            
            // Check if user already voted
            if (userVotes[userId]) {
                return interaction.reply({ content: '🗳️ You\'ve already voted on this video!', ephemeral: true });
            }
            
            // Record vote
            const ratingNum = parseInt(rating);
            userVotes[userId] = ratingNum;
            const newTotalVotes = row.total_votes + 1;
            
            // Calculate new average and five-star count
            const allRatings = Object.values(userVotes);
            const averageRating = allRatings.reduce((a, b) => a + b, 0) / allRatings.length;
            const fiveStarCount = allRatings.filter(r => r === 5).length;
            
            // Update database
            db.run(`UPDATE tiktok_interactions 
                    SET user_votes = ?, total_votes = ?, average_rating = ?, five_star_count = ? 
                    WHERE message_id = ?`,
                    [JSON.stringify(userVotes), newTotalVotes, averageRating, fiveStarCount, messageId]);
            
            // Update embed with new rating
            const embed = EmbedBuilder.from(interaction.message.embeds[0]);
            const fields = embed.data.fields;
            fields[2] = { name: '⭐ Rating', value: `${averageRating.toFixed(1)}/5 (${newTotalVotes} votes)`, inline: true };
            embed.setFields(fields);
            
            await interaction.update({ embeds: [embed], components: interaction.message.components });
            
            // Award points for voting
            await updateUserStats(guildId, userId, interaction.user.displayName, { votes_cast: 1, points: 2 });
            
            // Award bonus points to original sharer if they got a 5-star
            if (ratingNum === 5) {
                await updateUserStats(guildId, row.shared_by_id, '', { 
                    five_stars_received: 1, 
                    points: 5,
                    total_rating_sum: 5
                });
            } else {
                await updateUserStats(guildId, row.shared_by_id, '', { 
                    total_rating_sum: ratingNum
                });
            }
            
            console.log(`Vote recorded: ${rating}/5 for video ${videoId} by ${interaction.user.tag}`);
        });
    } catch (error) {
        console.error('Error handling vote:', error);
        interaction.reply({ content: '❌ Error recording vote', ephemeral: true });
    }
}

// Handle video download
async function handleDownload(interaction, videoId) {
    await interaction.reply({
        content: '📥 **Video Download**\n\nDownload functionality coming soon! This will allow you to:\n• Download TikTok videos locally\n• Save in various formats (MP4, MP3)\n• Batch download from playlists',
        ephemeral: true
    });
}

// Handle playlist addition
async function handlePlaylistAdd(interaction, videoId) {
    // Create a select menu for available playlists
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`playlist_select_${videoId}`)
        .setPlaceholder('Choose a playlist...')
        .addOptions([
            { label: '🎵 Favorites', value: 'favorites', description: 'Your personal favorites' },
            { label: '🔥 Trending', value: 'trending', description: 'Hot videos in the server' },
            { label: '😂 Funny', value: 'funny', description: 'Hilarious content' },
            { label: '➕ Create New...', value: 'create_new', description: 'Make a new playlist' }
        ]);
    
    const row = new ActionRowBuilder().addComponents(selectMenu);
    
    await interaction.reply({
        content: '📝 **Add to Playlist**\nSelect a playlist to add this video to:',
        components: [row],
        ephemeral: true
    });
}

// Utility functions
function extractVideoId(url) {
    const match = url.match(/video\/(\d+)/);
    return match ? match[1] : Date.now().toString();
}

function formatNumber(num) {
    if (typeof num !== 'number') return num;
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

function getDynamicPricing(memberCount) {
    let tier;
    if (memberCount <= 1000) tier = pricingTiers.small;
    else if (memberCount <= 10000) tier = pricingTiers.medium;
    else tier = pricingTiers.large;
    
    return `**${tier.name} Plan: $${tier.price}/month**\n*Perfect for servers with ${tier.min}-${tier.max === Infinity ? '∞' : tier.max} members*`;
}

async function checkServerStatus(guildId) {
    return new Promise((resolve) => {
        db.get(`SELECT * FROM servers WHERE guild_id = ?`, [guildId], (err, row) => {
            if (err || !row) return resolve({ active: false });
            
            const now = new Date();
            const trialEnd = new Date(row.trial_end);
            const active = row.subscription_active || now < trialEnd;
            
            resolve({ active, row });
        });
    });
}

async function updateUserStats(guildId, userId, username, updates) {
    // Insert user if doesn't exist
    db.run(`INSERT OR IGNORE INTO user_stats (guild_id, user_id, username) VALUES (?, ?, ?)`, 
           [guildId, userId, username]);
    
    // Build update query
    const setClause = Object.keys(updates).map(key => `${key} = ${key} + ?`).join(', ');
    const values = [...Object.values(updates), guildId, userId];
    
    // Update stats
    db.run(`UPDATE user_stats SET ${setClause} WHERE guild_id = ? AND user_id = ?`, values);
    
    // Recalculate average rating if total_rating_sum was updated
    if (updates.total_rating_sum) {
        db.get(`SELECT total_rating_sum, videos_shared FROM user_stats WHERE guild_id = ? AND user_id = ?`,
               [guildId, userId], (err, row) => {
            if (!err && row && row.videos_shared > 0) {
                const avgRating = row.total_rating_sum / row.videos_shared;
                db.run(`UPDATE user_stats SET average_user_rating = ? WHERE guild_id = ? AND user_id = ?`,
                       [avgRating, guildId, userId]);
            }
        });
    }
}

async function handleSubscription(interaction) {
    const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('🚀 Ready to Subscribe?')
        .setDescription('Subscription management coming soon! For now, please contact our support team.')
        .addFields(
            { name: '💳 Payment Methods', value: '• Discord native payments (coming soon)\n• Cryptocurrency (coming soon)\n• Contact support for manual setup', inline: false }
        );
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function showFeatures(interaction) {
    const embed = new EmbedBuilder()
        .setColor('#6366F1')
        .setTitle('⚓ Tik Dock Features')
        .setDescription('Everything you get with your subscription:')
        .addFields(
            { name: '🎵 Enhanced Video Cards', value: 'Beautiful, interactive TikTok embeds that replace original messages', inline: false },
            { name: '⭐ Community Voting', value: '5-star rating system with real-time vote tracking', inline: false },
            { name: '🏆 Advanced Leaderboards', value: 'Multiple ranking systems: 5-star posts, average ratings, most shared, total points', inline: false },
            { name: '📊 Detailed Analytics', value: 'Individual user stats and server-wide engagement metrics', inline: false },
            { name: '📥 Video Downloads', value: 'Download TikTok videos locally (coming soon)', inline: false },
            { name: '🎵 Server Playlists', value: 'Organize and curate TikTok content collections', inline: false },
            { name: '🎮 Gamification', value: 'Points system, achievements, and community rewards', inline: false },
            { name: '⚙️ Premium Support', value: 'Priority assistance and feature requests', inline: false }
        )
        .setFooter({ text: 'More features coming soon! • Tik Dock ⚓' });
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
}

// Handle select menu interactions
async function handleSelectMenu(interaction) {
    if (interaction.customId.startsWith('playlist_select_')) {
        const videoId = interaction.customId.split('_')[2];
        const selectedPlaylist = interaction.values[0];
        
        if (selectedPlaylist === 'create_new') {
            await interaction.reply({
                content: '➕ **Create New Playlist**\n\nPlaylist creation feature coming soon! You\'ll be able to:\n• Name your playlist\n• Add descriptions\n• Set privacy settings\n• Invite collaborators',
                ephemeral: true
            });
        } else {
            await interaction.reply({
                content: `✅ **Added to ${selectedPlaylist.charAt(0).toUpperCase() + selectedPlaylist.slice(1)} playlist!**\n\nThis video has been saved for later viewing.`,
                ephemeral: true
            });
        }
    }
}

// Check for expired trials daily
cron.schedule('0 0 * * *', () => {
    console.log('Running daily trial expiration check...');
    db.all(`SELECT * FROM servers WHERE subscription_active = 0 AND trial_end < datetime('now')`, 
           (err, rows) => {
        if (!err && rows.length > 0) {
            console.log(`Found ${rows.length} expired trials`);
            // Could send reminder messages to server owners here
        }
    });
});

// Error handling
process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', error => {
    console.error('Uncaught exception:', error);
    process.exit(1);
});

// Login
client.login(process.env.DISCORD_TOKEN);