Discord Vouch Bot
A powerful and configurable Discord bot for managing vouches with ratings, backups, and custom branding.
⚡ Quick Setup

Install dependencies
bashnpm install

Configure the bot

Edit config.toml with your Discord bot token and server details
Set your business name, channels, and permissions


Run the bot
bashnpm start


🔧 Configuration
Edit config.toml:
tomltoken = "YOUR_BOT_TOKEN"
guildId = "YOUR_SERVER_ID" 
ownerRoleId = "ADMIN_ROLE_ID"
businessName = "Your Business Name"
vouchInAllChannels = false  # true = all channels, false = specific channel
allowVouchChannelId = "VOUCH_CHANNEL_ID"  # if vouchInAllChannels = false
emojiVouch = "⭐"
📋 Commands
Everyone

/vouch - Give a vouch with 1-5 star rating, message, and optional image
/vouches - Check vouch count for yourself or others
/help - Show available commands

Owners Only

/backup - Export all vouches to JSON file
/restore_vouches - Restore vouches to any channel
/info - View bot statistics

🎨 Features

Custom Branding - Your business name and logo in embeds
Rating System - 1-5 star ratings with custom emojis
Image Support - Attach images or URLs to vouches
Permission Control - Owner-only admin commands
Channel Restrictions - Limit vouches to specific channels
Data Persistence - Automatic saving with backup/restore
Professional Embeds - Clean, branded vouch displays

🛡️ Getting Discord IDs

Enable Developer Mode in Discord Settings
Right-click on servers/channels/roles → "Copy ID"
Paste the IDs into your config.toml






nodeJs link 

https://nodejs.org/en