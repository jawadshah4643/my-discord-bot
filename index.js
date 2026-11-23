// ============================================================
//  Discord Bot  —  Verification + Invite Tracking + Brand Samples
//  RENDER / CLOUD VERSION  (discord.js v14)
// ============================================================

const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  Events,
} = require('discord.js');

const { google } = require('googleapis');

// ---------------- DUMMY WEB SERVER FOR RENDER ----------------
const http = require('http');
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot is alive!');
}).listen(process.env.PORT || 3000, () => {
  console.log("Web server is running for Render uptime.");
});
// -------------------------------------------------------------

// ---------------- READ SECRETS FROM ENVIRONMENT ----------------
const TOKEN              = process.env.TOKEN;
const VERIFY_CHANNEL_ID  = process.env.VERIFY_CHANNEL_ID;
const VERIFIED_ROLE_ID   = process.env.VERIFIED_ROLE_ID;
const SPREADSHEET_ID     = process.env.SPREADSHEET_ID;
const GOOGLE_CREDENTIALS = process.env.GOOGLE_CREDENTIALS; // full JSON as a string
const SAMPLE_CHANNEL_ID  = process.env.SAMPLE_CHANNEL_ID;  // Jolly Smile Channel
const KAVAYN_CHANNEL_ID  = process.env.KAVAYN_CHANNEL_ID;  // Kavayn Channel
// ---------------------------------------------------------------

// Safety check so we get a clear message if a variable is missing.
for (const [name, val] of Object.entries({
  TOKEN, VERIFY_CHANNEL_ID, VERIFIED_ROLE_ID, SPREADSHEET_ID, GOOGLE_CREDENTIALS,
})) {
  if (!val) {
    console.error(`MISSING ENVIRONMENT VARIABLE: ${name} — set it in Render > Variables.`);
    process.exit(1);
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildInvites,
  ],
});

const inviteCache = new Map();

// ---------- Google Sheets setup (key from env variable) ----------
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(GOOGLE_CREDENTIALS),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

async function appendToSheet(tabName, values) {
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${tabName}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [values] },
    });
  } catch (e) {
    console.log(`Google Sheet write failed (${tabName}):`, e.message);
  }
}

// ============================================================
//  UNIFIED ON READY (Handles Verification & Free Sample Setups)
// ============================================================
client.once(Events.ClientReady, async (c) => {
  console.log(`Logged in as ${c.user.tag}`);

  // 1. Fetch Invites
  for (const guild of c.guilds.cache.values()) {
    try {
      const invites = await guild.invites.fetch();
      const codeUses = new Map();
      invites.forEach((inv) => codeUses.set(inv.code, inv.uses));
      inviteCache.set(guild.id, codeUses);
    } catch (e) {
      console.log(`Could not fetch invites for ${guild.name} (need Manage Server permission).`);
    }
  }

  // 2. Setup #verify-yourself Channel Message
  try {
    const channel = await client.channels.fetch(VERIFY_CHANNEL_ID);
    const messages = await channel.messages.fetch({ limit: 50 });
    const botMessage = messages.find(m => m.author.id === client.user.id && m.embeds.length > 0);

    if (!botMessage) {
      const embed = new EmbedBuilder()
        .setTitle('Verification Required')
        .setDescription('Enter your TikTok username by clicking the **Verify** button below to get full server access.')
        .setColor(0x5865f2);
      const button = new ButtonBuilder()
        .setCustomId('verify_button')
        .setLabel('Verify')
        .setStyle(ButtonStyle.Success);
      const row = new ActionRowBuilder().addComponents(button);
      await channel.send({ embeds: [embed], components: [row] });
      console.log("Sent a new verification message.");
    } else {
      console.log("Verification message already exists. Skipping duplicate.");
    }
  } catch (err) {
    console.error("Failed to check or send verification message:", err.message);
  }

  // 3. Setup Jolly Smile Free Sample Channel Message
  if (SAMPLE_CHANNEL_ID) {
    try {
      const sampleChannel = await client.channels.fetch(SAMPLE_CHANNEL_ID);
      const sampleMessages = await sampleChannel.messages.fetch({ limit: 50 });
      const existingSampleButton = sampleMessages.find(m => m.author.id === client.user.id && m.components.length > 0);

      if (!existingSampleButton) {
        const embed = new EmbedBuilder()
          .setTitle('🎁 Claim Your Free Sample')
          .setDescription('Click the button below to submit your TikTok username and secure your free sample!')
          .setColor(0x2ecc71);

        const button = new ButtonBuilder()
          .setCustomId('sample_button')
          .setLabel('Claim Free Sample')
          .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(button);
        await sampleChannel.send({ embeds: [embed], components: [row] });
        console.log("Posted the Jolly Smile Free Sample button message.");
      } else {
        console.log("Jolly Smile Free Sample button already exists. Skipping duplicate.");
      }
    } catch (err) {
      console.error("Failed to post Jolly Smile free sample button:", err.message);
    }
  }

  // 4. Setup Kavayn Free Sample Channel Message
  if (KAVAYN_CHANNEL_ID) {
    try {
      const kavaynChannel = await client.channels.fetch(KAVAYN_CHANNEL_ID);
      const kavaynMessages = await kavaynChannel.messages.fetch({ limit: 50 });
      const existingKavaynButton = kavaynMessages.find(m => m.author.id === client.user.id && m.components.length > 0);

      if (!existingKavaynButton) {
        const embed = new EmbedBuilder()
          .setTitle('🎁 Claim Your Kavayn Free Sample')
          .setDescription('Click the button below to submit your TikTok username and secure your free sample!')
          .setColor(0x2ecc71);

        const button = new ButtonBuilder()
          .setCustomId('kavayn_sample_button')
          .setLabel('Claim Free Sample')
          .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(button);
        await kavaynChannel.send({ embeds: [embed], components: [row] });
        console.log("Posted the Kavayn Free Sample button message.");
      } else {
        console.log("Kavayn Free Sample button already exists. Skipping duplicate.");
      }
    } catch (err) {
      console.error("Failed to post Kavayn free sample button:", err.message);
    }
  }
});

// ============================================================
//  KEEP INVITE CACHE FRESH
// ============================================================
client.on(Events.InviteCreate, (invite) => {
  const g = inviteCache.get(invite.guild.id) || new Map();
  g.set(invite.code, invite.uses);
  inviteCache.set(invite.guild.id, g);
});
client.on(Events.InviteDelete, (invite) => {
  const g = inviteCache.get(invite.guild.id);
  if (g) g.delete(invite.code);
});

// ============================================================
//  MEMBER JOINS -> detect invite -> log to Sheet
// ============================================================
client.on(Events.GuildMemberAdd, async (member) => {
  try {
    const newInvites = await member.guild.invites.fetch();
    const oldUses = inviteCache.get(member.guild.id) || new Map();
    const used = newInvites.find((inv) => inv.uses > (oldUses.get(inv.code) || 0));

    const updated = new Map();
    newInvites.forEach((inv) => updated.set(inv.code, inv.uses));
    inviteCache.set(member.guild.id, updated);

    const when      = new Date().toLocaleString();
    const newMember = member.user.tag;
    const newId     = member.user.id;
    const inviter   = used && used.inviter ? used.inviter.tag : 'Unknown';
    const inviterId = used && used.inviter ? used.inviter.id  : 'Unknown';
    const code      = used ? used.code : 'Unknown';

    await appendToSheet('Invites', [when, newMember, newId, inviter, inviterId, code]);
    console.log(`${newMember} joined via ${code} (invited by ${inviter})`);
  } catch (e) {
    console.log('Invite tracking failed:', e.message);
  }
});

// ============================================================
//  ALL BUTTONS & MODALS (Verification + Jolly Smile + Kavayn)
// ============================================================
client.on(Events.InteractionCreate, async (interaction) => {

  // ---------------- BUTTON CLICKS ----------------
  if (interaction.isButton()) {

    // 1. Verification Button
    if (interaction.customId === 'verify_button') {
      const modal = new ModalBuilder()
        .setCustomId('verify_modal')
        .setTitle('TikTok Verification');
      const input = new TextInputBuilder()
        .setCustomId('tiktok_username')
        .setLabel('Your TikTok username (no spaces)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('yourusername')
        .setRequired(true)
        .setMaxLength(30);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
      return;
    }

    // 2. Jolly Smile Free Sample Button
    if (interaction.customId === 'sample_button') {
      const modal = new ModalBuilder()
        .setCustomId('sample_modal')
        .setTitle('Free Sample Request');
      const input = new TextInputBuilder()
        .setCustomId('sample_full_name')
        .setLabel('Enter your TikTok username (no spaces)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('yourusername')
        .setRequired(true)
        .setMaxLength(50);
modal.addComponents(new ActionRowBuilder().addComponents(input));
await interaction.showModal(modal);
return;
}
// 3. Kavayn Free Sample Button
if (interaction.customId === 'kavayn_sample_button') {
const modal = new ModalBuilder()
.setCustomId('kavayn_sample_modal')
.setTitle('Kavayn Free Sample Request');
const input = new TextInputBuilder()
.setCustomId('kavayn_tiktok_username')
.setLabel('Enter your TikTok username (no spaces)')
.setStyle(TextInputStyle.Short)
.setPlaceholder('yourusername')
.setRequired(true)
.setMaxLength(50);
modal.addComponents(new ActionRowBuilder().addComponents(input));
await interaction.showModal(modal);
return;
}
}
  // ---------------- MODAL SUBMISSIONS ----------------
  if (interaction.isModalSubmit()) {

    // 1. Verification Modal Submit
    if (interaction.customId === 'verify_modal') {
      const username = interaction.fields.getTextInputValue('tiktok_username');

      if (/\s/.test(username)) {
        await interaction.reply({
          content: 'Error: Username must not contain spaces. Please click Verify again and try without spaces.',
          flags: 64,
        });
        return;
      }

      await interaction.deferReply({ flags: 64 });

      try {
        const member = await interaction.guild.members.fetch(interaction.user.id);
        await member.roles.add(VERIFIED_ROLE_ID);

        await appendToSheet('Verified', [
          new Date().toLocaleString(),
          interaction.user.tag,
          interaction.user.id,
          username,
        ]);

        await interaction.editReply({
          content: "Verified! Your TikTok " + username + " was saved and you now have full server access.",
        });
      } catch (err) {
        console.error(err);
        await interaction.editReply({
          content: 'Something went wrong granting your role. Contact an admin.',
        });
      }
      return;
    }

    // 2. Jolly Smile Free Sample Modal Submit
    if (interaction.customId === 'sample_modal') {
      const fullName = interaction.fields.getTextInputValue('sample_full_name');
      await interaction.deferReply({ flags: 64 });

      try {
        const when       = new Date().toLocaleString();
        const discordTag = interaction.user.tag;
        const discordId  = interaction.user.id;

        await appendToSheet('Jolly Smile Samples', [when, discordTag, discordId, fullName]);

        await interaction.editReply({
          content: 'Success! Your TikTok username **"' + fullName + '"** has been securely recorded for a free sample.',
        });
        console.log("Jolly Smile sample recorded for " + discordTag + ": " + fullName);
      } catch (err) {
        console.error("Failed to record Jolly Smile sample data:", err.message);
        await interaction.editReply({
          content: 'Something went wrong while saving your entry. Please contact an admin.',
        });
      }
      return;
    }

    // 3. Kavayn Free Sample Modal Submit
    if (interaction.customId === 'kavayn_sample_modal') {
      const kavaynUsername = interaction.fields.getTextInputValue('kavayn_tiktok_username');
      await interaction.deferReply({ flags: 64 });

      try {
        const when       = new Date().toLocaleString();
        const discordTag = interaction.user.tag;
        const discordId  = interaction.user.id;

        await appendToSheet('Kavayn Samples', [when, discordTag, discordId, kavaynUsername]);

        await interaction.editReply({
          content: 'Success! Your TikTok username **"' + kavaynUsername + '"** has been securely recorded for a Kavayn free sample.',
        });
        console.log("Kavayn sample recorded for " + discordTag + ": " + kavaynUsername);
      } catch (err) {
        console.error("Failed to record Kavayn sample data:", err.message);
        await interaction.editReply({
          content: 'Something went wrong while saving your entry. Please contact an admin.',
        });
      }
      return;
    }
  }
});

client.login(TOKEN);
