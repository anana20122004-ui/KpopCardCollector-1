import { Client, GatewayIntentBits, Collection, Events, REST, Routes, ActivityType } from 'discord.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readdir } from 'fs/promises';
import { createServer } from 'http';
import { supabase } from './database/supabase.js';
import { renderSearchPage } from './commands/search.js';

/* =========================
   START WEB SERVER FIRST
   ========================= */

const PORT = parseInt(process.env.PORT || '3000', 10);

createServer((req, res) => {
  res.writeHead(200);
  res.end('Bot is running');
}).listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 Web server running on port ${PORT}`);
});

/* =========================
   BOT SETUP
   ========================= */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

(global as any).botState = { lockdownMode: false };

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

const commands = new Collection<string, any>();
const commandCooldowns = new Map<string, number>(); // userId -> last command timestamp

/* =========================
   LOAD COMMANDS
   ========================= */

async function loadCommands() {

  const commandsPath = join(__dirname, 'commands');
  const commandFiles = (await readdir(commandsPath)).filter(file => file.endsWith('.js'));

  commands.clear();

  for (const file of commandFiles) {

    const filePath = join(commandsPath, file);
    const command = await import(`${filePath}?t=${Date.now()}`);

    if ('data' in command && 'execute' in command) {

      commands.set(command.data.name, command);

      console.log(`<:cottage:1457128646274973766> Loaded command: ${command.data.name}`);

    }

  }

}

/* =========================
   REGISTER SLASH COMMANDS
   ========================= */

async function registerCommands() {

  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;

  if (!token || !clientId) {

    console.error('Missing env vars');
    process.exit(1);

  }

  const rest = new REST().setToken(token);
  const commandData = Array.from(commands.values()).map(cmd => cmd.data.toJSON());

  try {

    await rest.put(
      Routes.applicationCommands(clientId),
      { body: commandData }
    );

    console.log('<:cottage:1457128646274973766> Successfully registered slash commands!');

  } catch (error) {

    console.error('Error registering commands:', error);

  }

}

/* =========================
   BOT READY EVENT
   ========================= */

client.once(Events.ClientReady, async () => {

  console.log(`✨ Bot is online as ${client.user?.username}`);

  client.user?.setActivity('RUDE!', {
    type: ActivityType.Streaming,
    url: 'https://www.youtube.com/watch?v=Q4AE3ub4nBM'
  });

});

/* =========================
   INTERACTION HANDLER
   ========================= */

client.on(Events.InteractionCreate, async (interaction) => {

  if (interaction.isButton()) {

    const customId = interaction.customId;

    /* ===== INVENTORY BUTTONS ===== */

    if (customId.startsWith('inv_')) {

      const parts = customId.split('_');
      const action = parts[1];
      if (action === 'page') return;

      const userId = parts[2];
      const rarityFilter = parts[3] === 'all' ? null : parseInt(parts[3]);
      const groupFilter = parts[4] === 'all' ? null : parts[4];
      const eraFilter = parts[5] === 'all' ? null : parts[5];
      const idolFilter = parts[6] === 'all' ? null : parts[6];
      const searchFilter = parts[7] === 'all' ? null : parts[7];

      const command = commands.get('inventory');

      if (command) {

        await interaction.deferUpdate();

        const row = (interaction.message.components[0] as any);
        const pageLabel = row.components[1].label;

        const [currentPage, totalPages] = pageLabel.split(' / ').map(Number);

        let newPage = currentPage;

        if (action === 'prev') newPage = Math.max(1, currentPage - 1);
        if (action === 'next') newPage = Math.min(totalPages, currentPage + 1);

        const mockInteraction = {
          ...interaction,
          isButton: () => true,
          deferReply: () => Promise.resolve(),
          editReply: (options: any) => interaction.editReply(options),
          options: {
            getUser: () => (userId === interaction.user.id ? null : { id: userId }),
            getInteger: (name: string) => name === 'page' ? newPage : name === 'rarity' ? rarityFilter : null,
            getString: (name: string) => {
              if (name === 'group') return groupFilter;
              if (name === 'era') return eraFilter;
              if (name === 'idol') return idolFilter;
              if (name === 'search') return searchFilter;
              return null;
            },
            getBoolean: () => null
          }
        };

        await command.execute(mockInteraction);

      }

      return;

    }

    /* ===== CARDID BUTTONS ===== */

    if (customId.startsWith('cardid_')) {

      const parts = customId.split('_');
      const action = parts[1];
      if (action === 'page') return;

      const command = commands.get('cardid');

      if (command) {

        await interaction.deferUpdate();

        const row = (interaction.message.components[0] as any);
        const pageLabel = row.components[1].label;

        const [currentPage, totalPages] = pageLabel.split(' / ').map(Number);

        let newPage = currentPage;

        if (action === 'prev') newPage = Math.max(1, currentPage - 1);
        if (action === 'next') newPage = Math.min(totalPages, currentPage + 1);

        const mockInteraction = {
          ...interaction,
          isButton: () => true,
          deferReply: () => Promise.resolve(),
          editReply: (options: any) => interaction.editReply(options),
          options: {
            getInteger: (name: string) => name === 'page' ? newPage : null,
            getString: () => null,
            getBoolean: () => null
          }
        };

        await command.execute(mockInteraction);

      }

      return;

    }

    /* ===== SEARCH BUTTONS ===== */

    if (customId.startsWith('search_NAV_')) {

      const parts = customId.split('_');
      // format: search_NAV_page_idol_group_era_rarity_designer_action
      const currentPage = parseInt(parts[2]);
      const idol    = parts[3];
      const group   = parts[4];
      const era     = parts[5];
      const rarity  = parts[6];
      const designer = parts[7];
      const action  = parts[8];

      if (action === 'page') return;

      await interaction.deferUpdate();

      const newPage = action === 'next' ? currentPage + 1 : currentPage - 1;

      // Re-fetch cards using the stored filters
      let query = supabase.from('cards').select('*');
      if (idol !== 'all')     query = query.ilike('name', `%${idol}%`);
      if (group !== 'all')    query = query.ilike('group', `%${group}%`);
      if (era !== 'all')      query = query.ilike('era', `%${era}%`);
      if (rarity !== 'all')   query = query.eq('rarity', parseInt(rarity));
      if (designer !== 'all') query = query.eq('designer_id', designer);

      const { data: cards } = await query.order('group', { ascending: true });
      if (!cards || cards.length === 0) return;

      const mockInteraction = {
        ...interaction,
        editReply: (options: any) => interaction.editReply(options)
      };

      await renderSearchPage(mockInteraction, cards, newPage, idol, group, era, rarity, designer);
      return;

    }

    /* ===== COLLECT BUTTONS ===== */

    if (customId.startsWith('collect_')) {

      const parts = customId.split('_');
      const action = parts[1];
      if (action === 'page') return;

      const userId = parts[2];
      const currentPage = parseInt(parts[3]);
      const idol = parts[4] === 'all' ? null : parts[4];
      const group = parts[5] === 'all' ? null : parts[5];
      const rarity = parts[6] === 'all' ? null : parseInt(parts[6]);
      const missing = parts[7] === '1';

      const command = commands.get('collect');

      if (command) {

        await interaction.deferUpdate();

        let newPage = action === 'next' ? currentPage + 1 : currentPage - 1;

        const mockInteraction = {
          ...interaction,
          isButton: () => true,
          deferReply: () => Promise.resolve(),
          editReply: (opt: any) => interaction.editReply(opt),
          options: {
            getUser: () => ({ id: userId }),
            getInteger: (n: string) => (n === 'page' ? newPage : n === 'rarity' ? rarity : null),
            getString: (n: string) => (n === 'idol' ? idol : n === 'group' ? group : null),
            getBoolean: (n: string) => (n === 'missing' ? missing : null)
          }
        };

        await command.execute(mockInteraction);

      }

      return;

    }

  }

  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);
  if (!command) return;

  // 8-second global per-user cooldown between commands
  const now8 = Date.now();
  const lastUsed = commandCooldowns.get(interaction.user.id) || 0;
  const elapsed8 = now8 - lastUsed;
  if (elapsed8 < 8000) {
    const remaining = ((8000 - elapsed8) / 1000).toFixed(1);
    try {
      await interaction.reply({ content: `⏳ Please wait **${remaining}s** before using another command.`, ephemeral: true });
    } catch (_) {}
    return;
  }
  commandCooldowns.set(interaction.user.id, now8);

  // Defer IMMEDIATELY so Discord's 3-second window is never missed
  try { await interaction.deferReply(); } catch (_) { return; }

  // Patch deferReply to no-op so commands calling it again don't throw
  (interaction as any).deferReply = () => Promise.resolve();

  // Now safely fetch language (deferred, so no timeout risk)
  let userLanguage = 'en';
  try {
    const { data: userData } = await supabase
      .from('users')
      .select('language')
      .eq('user_id', interaction.user.id)
      .maybeSingle();
    userLanguage = (userData as any)?.language || 'en';
  } catch (_) {}

  (interaction as any).userLanguage = userLanguage;

  try {

    await command.execute(interaction);

  } catch (error) {

    console.error(error);

  }

});

/* =========================
   START BOT
   ========================= */

async function start() {

  try {
    console.log('🚀 Starting bot...');
    
    console.log('📦 Loading commands...');
    await loadCommands();
    console.log('✅ Commands loaded!');
    
    console.log('📝 Registering slash commands...');
    await registerCommands();
    console.log('✅ Slash commands registered!');
    
    console.log('🔐 Logging into Discord...');
    await client.login(process.env.DISCORD_TOKEN);
    console.log('✅ Logged in!');
  } catch (error) {
    console.error('❌ Startup error:', error);
    process.exit(1);
  }

}

start();

/* =========================
   CRASH PROTECTION
   ========================= */

process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);
