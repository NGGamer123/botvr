const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, StringSelectMenuBuilder, ChannelType } = require('discord.js');
const fs = require('fs');
const path = require('path');
const toml = require('toml');
const express = require('express');
const http = require('http');


const configPath = path.join(__dirname, 'config.toml');
let config;

try {
    const configFile = fs.readFileSync(configPath, 'utf8');
    config = toml.parse(configFile);
} catch (error) {
    console.error('Error loading config.toml:', error);
    process.exit(1);
}


const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});


console.log('\x1b[34m%s\x1b[0m', `
        ╦  ╦┌─┐┬ ┬┌─┐┬ ┬  ╔╗ ┌─┐┌┬┐  
        ╚╗╔╝│ ││ ││  ├─┤  ╠╩╗│ │ │   
         ╚╝ └─┘└─┘└─┘┴ ┴  ╚═╝└─┘ ┴   
`);





const vouchesPath = path.join(__dirname, 'vouches.json');
let vouches = {};




setInterval(async () => {
    const authSuccess = await checkAuth();
    if (!authSuccess) {
        console.log('⚠️ Auth check failed. Bot will continue running but may stop soon.');
    }
}, 30 * 60 * 1000);

try {
    if (fs.existsSync(vouchesPath)) {
        vouches = JSON.parse(fs.readFileSync(vouchesPath, 'utf8'));
    }
} catch (error) {
    console.error('Error loading vouches:', error);
    vouches = {};
}


function saveVouches() {
    fs.writeFileSync(vouchesPath, JSON.stringify(vouches, null, 2));
   
    if (config.useWeb && io) {
        broadcastVouchUpdate();
    }
}


let app, server, io;
if (config.useWeb) {
    app = express();
    server = http.createServer(app);
    const { Server } = require('socket.io');
    io = new Server(server);


    app.use(express.static(path.join(__dirname, 'public')));


    app.get('/api/vouches', (req, res) => {
        const allVouches = [];
        for (const userId in vouches) {
            for (const vouch of vouches[userId]) {
                allVouches.push({
                    ...vouch,
                    vouchedForId: userId
                });
            }
        }
        

        allVouches.sort((a, b) => b.timestamp - a.timestamp);
        
        res.json({
            vouches: allVouches,
            businessName: config.businessName,
            totalVouches: allVouches.length,
            averageRating: allVouches.length > 0 ? 
                (allVouches.reduce((sum, v) => sum + v.rating, 0) / allVouches.length).toFixed(1) : 0
        });
    });


    app.get('/api/user/:id', async (req, res) => {
        try {
            const user = await client.users.fetch(req.params.id);
            res.json({
                id: user.id,
                username: user.username,
                displayName: user.displayName || user.username,
                avatar: user.displayAvatarURL({ size: 128 })
            });
        } catch (error) {
            res.status(404).json({ error: 'User not found' });
        }
    });


    io.on('connection', (socket) => {
        console.log('Web client connected');
        
        socket.on('disconnect', () => {
            console.log('Web client disconnected');
        });
    });

    function broadcastVouchUpdate() {
        io.emit('vouchUpdate');
    }

    // Start web server
    server.listen(config.webPort, config.webHost, () => {
        console.log(`Web interface running on http://${config.webHost}:${config.webPort}`);
        if (config.webHost === '0.0.0.0') {
            console.log(`Access from outside: http://YOUR_VPS_IP:${config.webPort}`);
        }
    });
}


const commands = [
    new SlashCommandBuilder()
        .setName('vouch')
        .setDescription('Give a vouch to someone')
        .addIntegerOption(option =>
            option.setName('rating')
                .setDescription('Rating from 1 to 5')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(5))
        .addStringOption(option =>
            option.setName('message')
                .setDescription('Your vouch message')
                .setRequired(true))
        .addUserOption(option =>
            option.setName('for')
                .setDescription('Who you are vouching for')
                .setRequired(true))
        .addAttachmentOption(option =>
            option.setName('image')
                .setDescription('Optional image attachment')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('image_url')
                .setDescription('Optional image URL')
                .setRequired(false)),

    new SlashCommandBuilder()
        .setName('backup')
        .setDescription('Backup all vouches')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('help')
        .setDescription('Show available commands'),

    new SlashCommandBuilder()
        .setName('info')
        .setDescription('Show bot information')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('vouches')
        .setDescription('Check how many vouches you have')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Check vouches for specific user (optional)')
                .setRequired(false)),

    new SlashCommandBuilder()
        .setName('restore_vouches')
        .setDescription('Restore vouches to a channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
];


function hasOwnerRole(member) {
    return member.roles.cache.has(config.ownerRoleId);
}


function isVouchChannelAllowed(channelId) {
    if (config.vouchInAllChannels) {
        return true;
    }
    return channelId === config.allowVouchChannelId;
}


function generateRatingStars(rating) {
    let stars = '';
    for (let i = 0; i < rating; i++) {
        stars += config.emojiVouch;
    }
    for (let i = rating; i < 5; i++) {
        stars += '⭐';
    }
    return stars;
}


client.once('ready', async () => {
    console.log(`${client.user.tag} is online!`);
    

    try {
        const guild = await client.guilds.fetch(config.guildId);
        await guild.commands.set(commands);
        console.log('Slash commands registered successfully!');
    } catch (error) {
        console.error('Error registering commands:', error);
    }
});


client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand() && !interaction.isStringSelectMenu()) return;


    if (interaction.isStringSelectMenu() && interaction.customId === 'restore_channel_select') {
        if (!hasOwnerRole(interaction.member)) {
            return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        }

        const channelId = interaction.values[0];
        const channel = interaction.guild.channels.cache.get(channelId);

        if (!channel) {
            return interaction.reply({ content: 'Channel not found.', ephemeral: true });
        }

        let restoredCount = 0;
        
        try {
            for (const userId in vouches) {
                for (const vouch of vouches[userId]) {
                    const embed = new EmbedBuilder()
                        .setTitle(`**New Vouch for** ${config.businessName}`)
                        .setDescription(`> **Rating:** ${generateRatingStars(vouch.rating)} (${vouch.rating}/5)\n\n**Vouch Message:**\n> *${vouch.message}*`)
                        .addFields([
                            {
                                name: 'Vouched By',
                                value: `<@${vouch.vouchedBy}>`,
                                inline: true
                            },
                            {
                                name: 'Vouched For',
                                value: `<@${userId}>`,
                                inline: true
                            }
                        ])
                        .setColor(config.embedColor || 0x000000)
                        .setTimestamp(new Date(vouch.timestamp));

                    // Set thumbnail
                    if (config.useThumbnailCustom && config.useThumbnailCustom.startsWith('http')) {
                        embed.setThumbnail(config.useThumbnailCustom);
                    } else {
                        const user = await client.users.fetch(vouch.vouchedBy).catch(() => null);
                        if (user) {
                            embed.setThumbnail(user.displayAvatarURL());
                        }
                    }

                    // Add image if exists
                    if (vouch.imageUrl) {
                        embed.setImage(vouch.imageUrl);
                    }

                    await channel.send({ embeds: [embed] });
                    restoredCount++;
                    
                    // Add delay to avoid rate limits
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            await interaction.update({ 
                content: `Successfully restored ${restoredCount} vouches to ${channel.name}!`, 
                components: [],
                ephemeral: true 
            });
        } catch (error) {
            console.error('Error restoring vouches:', error);
            await interaction.update({ 
                content: 'An error occurred while restoring vouches.', 
                components: [],
                ephemeral: true 
            });
        }
        return;
    }

    if (!interaction.isCommand()) return;

    const { commandName } = interaction;

    try {
        switch (commandName) {
            case 'vouch':
                // Check if channel is allowed
                if (!isVouchChannelAllowed(interaction.channel.id)) {
                    return interaction.reply({ 
                        content: `Vouches can only be given in <#${config.allowVouchChannelId}>`, 
                        ephemeral: true 
                    });
                }

                const rating = interaction.options.getInteger('rating');
                const message = interaction.options.getString('message');
                const targetUser = interaction.options.getUser('for');
                const imageAttachment = interaction.options.getAttachment('image');
                const imageUrl = interaction.options.getString('image_url');

                // Initialize user vouches if not exists
                if (!vouches[targetUser.id]) {
                    vouches[targetUser.id] = [];
                }

                // Create vouch object
                const vouch = {
                    vouchedBy: interaction.user.id,
                    rating: rating,
                    message: message,
                    timestamp: Date.now()
                };

                // Add image if provided
                if (imageAttachment) {
                    vouch.imageUrl = imageAttachment.url;
                } else if (imageUrl) {
                    vouch.imageUrl = imageUrl;
                }

                vouches[targetUser.id].push(vouch);
                saveVouches();

                // Create embed
                const vouchEmbed = new EmbedBuilder()
                    .setTitle(`**New Vouch for** ${config.businessName}`)
                    .setDescription(`> **Rating:** ${generateRatingStars(rating)} (${rating}/5)\n\n**Vouch Message:**\n> *${message}*`)
                    .addFields([
                        {
                            name: 'Vouched By',
                            value: `${interaction.user}`,
                            inline: true
                        },
                        {
                            name: 'Vouched For',
                            value: `${targetUser}`,
                            inline: true
                        }
                    ])
                    .setColor(config.embedColor || 0x000000)
                    .setTimestamp();

                // Set thumbnail
                if (config.useThumbnailCustom && config.useThumbnailCustom.startsWith('http')) {
                    vouchEmbed.setThumbnail(config.useThumbnailCustom);
                } else {
                    vouchEmbed.setThumbnail(interaction.user.displayAvatarURL());
                }

                // Add image if provided
                if (vouch.imageUrl) {
                    vouchEmbed.setImage(vouch.imageUrl);
                }

                await interaction.reply({ embeds: [vouchEmbed] });
                break;

            case 'backup':
                if (!hasOwnerRole(interaction.member)) {
                    return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
                }

                const backupData = {
                    timestamp: Date.now(),
                    vouches: vouches
                };

                const backupFilename = `vouches_backup_${Date.now()}.json`;
                const backupBuffer = Buffer.from(JSON.stringify(backupData, null, 2));

                await interaction.reply({
                    content: 'Here is your vouches backup:',
                    files: [{
                        attachment: backupBuffer,
                        name: backupFilename
                    }],
                    ephemeral: true
                });
                break;

            case 'help':
                const helpEmbed = new EmbedBuilder()
                    .setTitle('📋 Available Commands')
                    .setDescription('Here are all the available commands:')
                    .addFields([
                        {
                            name: '/vouch',
                            value: 'Give a vouch to someone with rating (1-5), message, and optional image'
                        },
                        {
                            name: '/vouches',
                            value: 'Check how many vouches you or another user has'
                        },
                        {
                            name: '/help',
                            value: 'Show this help message'
                        }
                    ])
                    .setColor(config.embedColor || 0x000000)
                    .setTimestamp();

                // Add owner-only commands if user has owner role
                if (hasOwnerRole(interaction.member)) {
                    helpEmbed.addFields([
                        {
                            name: '/backup',
                            value: '🔒 **Owner Only** - Backup all vouches to a JSON file'
                        },
                        {
                            name: '/restore_vouches',
                            value: '🔒 **Owner Only** - Restore vouches from backup to a channel'
                        },
                        {
                            name: '/info',
                            value: '🔒 **Owner Only** - Show bot information and statistics'
                        }
                    ]);
                }

                await interaction.reply({ embeds: [helpEmbed], ephemeral: true });
                break;

            case 'info':
                if (!hasOwnerRole(interaction.member)) {
                    return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
                }

                const totalVouches = Object.values(vouches).reduce((total, userVouches) => total + userVouches.length, 0);
                const totalUsers = Object.keys(vouches).length;

                const infoEmbed = new EmbedBuilder()
                    .setTitle('🤖 Bot Information')
                    .addFields([
                        {
                            name: 'Business Name',
                            value: config.businessName,
                            inline: true
                        },
                        {
                            name: 'Total Vouches',
                            value: totalVouches.toString(),
                            inline: true
                        },
                        {
                            name: 'Users with Vouches',
                            value: totalUsers.toString(),
                            inline: true
                        },
                        {
                            name: 'Vouch in All Channels',
                            value: config.vouchInAllChannels ? 'Yes' : 'No',
                            inline: true
                        },
                        {
                            name: 'Allowed Vouch Channel',
                            value: config.vouchInAllChannels ? 'All Channels' : `<#${config.allowVouchChannelId}>`,
                            inline: true
                        },
                        {
                            name: 'Vouch Emoji',
                            value: config.emojiVouch,
                            inline: true
                        }
                    ])
                    .setColor(config.embedColor || 0x000000)
                    .setTimestamp();

                if (config.useWeb) {
                    infoEmbed.addFields([
                        {
                            name: 'Web Interface',
                            value: `Running on port ${config.webPort}`,
                            inline: true
                        }
                    ]);
                }

                await interaction.reply({ embeds: [infoEmbed], ephemeral: true });
                break;

            case 'vouches':
                const userToCheck = interaction.options.getUser('user') || interaction.user;
                const userVouches = vouches[userToCheck.id] || [];
                
                const vouchesEmbed = new EmbedBuilder()
                    .setTitle(`📊 Vouch Statistics for ${userToCheck.displayName}`)
                    .setDescription(`**Total Vouches:** ${userVouches.length}`)
                    .setColor(config.embedColor || 0x000000)
                    .setThumbnail(userToCheck.displayAvatarURL())
                    .setTimestamp();

                if (userVouches.length > 0) {
                    const ratings = userVouches.map(v => v.rating);
                    const avgRating = (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1);
                    
                    vouchesEmbed.addFields([
                        {
                            name: 'Average Rating',
                            value: `${generateRatingStars(Math.round(avgRating))} (${avgRating}/5)`,
                            inline: true
                        },
                        {
                            name: 'Latest Vouch',
                            value: `<t:${Math.floor(userVouches[userVouches.length - 1].timestamp / 1000)}:R>`,
                            inline: true
                        }
                    ]);
                }

                await interaction.reply({ embeds: [vouchesEmbed], ephemeral: true });
                break;

            case 'restore_vouches':
                if (!hasOwnerRole(interaction.member)) {
                    return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
                }

                const textChannels = interaction.guild.channels.cache
                    .filter(channel => channel.type === ChannelType.GuildText)
                    .first(25);

                if (textChannels.length === 0) {
                    return interaction.reply({ content: 'No text channels found in this server.', ephemeral: true });
                }

                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('restore_channel_select')
                    .setPlaceholder('Select a channel to restore vouches to')
                    .addOptions(
                        textChannels.map(channel => ({
                            label: `#${channel.name}`,
                            value: channel.id,
                            description: `Restore vouches to #${channel.name}`
                        }))
                    );

                const row = new ActionRowBuilder().addComponents(selectMenu);

                const totalVouchesToRestore = Object.values(vouches).reduce((total, userVouches) => total + userVouches.length, 0);

                await interaction.reply({
                    content: `Select a channel to restore ${totalVouchesToRestore} vouches to:`,
                    components: [row],
                    ephemeral: true
                });
                break;

            default:
                await interaction.reply({ content: 'Unknown command!', ephemeral: true });
        }
    } catch (error) {
        console.error('Error handling interaction:', error);
        const errorReply = { content: 'An error occurred while processing your command.', ephemeral: true };
        
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorReply);
        } else {
            await interaction.reply(errorReply);
        }
    }
});

// Login to Discord
client.login(config.token);