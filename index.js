// ============================================================
//  Discord Bot  —  Verification + Invite Tracking
//  RAILWAY / CLOUD VERSION  (discord.js v14)
// ============================================================
//  Difference from the local version:
//   - Reads all secrets from ENVIRONMENT VARIABLES (set on Railway),
//     NOT from inside this file. Nothing secret is written here.
//   - Google key is read from an env variable too (GOOGLE_CREDENTIALS).
//   - No local CSV/JSON backup (cloud containers reset). All data
//     goes to your Google Sheet, which is permanent.
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
const TOKEN             = process.env.TOKEN;
const VERIFY_CHANNEL_ID = process.env.VERIFY_CHANNEL_ID;
const VERIFIED_ROLE_ID  = process.env.VERIFIED_ROLE_ID;
const SPREADSHEET_ID    = process.env.SPREADSHEET_ID;
const GOOGLE_CREDENTIALS = process.env.GOOGLE_CREDENTIALS; // full JSON as a string
// ---------------------------------------------------------------

// Safety check so we get a clear message if a variable is missing.
for (const [name, val] of Object.entries({
  TOKEN, VERIFY_CHANNEL_ID, VERIFIED_ROLE_ID, SPREADSHEET_ID, GOOGLE_CREDENTIALS,
})) {
  if (!val) {
    console.error(`MISSING ENVIRONMENT VARIABLE: ${name} — set it in Railway > Variables.`);
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
//  ON READY
// ============================================================
client.once(Events.ClientReady, async (c) => {
  console.log(`Logged in as ${c.user.tag}`);

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

  const channel = await client.channels.fetch(VERIFY_CHANNEL_ID);
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
//  VERIFICATION button + modal
// ============================================================
client.on(Events.InteractionCreate, async (interaction) => {

  if (interaction.isButton() && interaction.customId === 'verify_button') {
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

  if (interaction.isModalSubmit() && interaction.customId === 'verify_modal') {
    const username = interaction.fields.getTextInputValue('tiktok_username');

    if (/\s/.test(username)) {
      await interaction.reply({
        content: 'Error: Username must not contain spaces. Please click Verify again and try without spaces.',
        flags: 64,
      });
      return;
    }

    await interaction.deferReply({ flags: 64 }); // "working on it" within 3 seconds

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
        content: `Verified! Your TikTok ${username} was saved and you now have full server access.`,
      });
    } catch (err) {
      console.error(err);
      await interaction.editReply({
        content: 'Something went wrong granting your role. Contact an admin.',
      });
    }
    return;
  }
});

client.login(TOKEN);
