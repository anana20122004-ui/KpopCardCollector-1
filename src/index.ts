import { Client, GatewayIntentBits, Collection, Events, REST, Routes, ActivityType } from 'discord.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readdir } from 'fs/promises';
import { createServer } from 'http';
import { supabase } from './database/supabase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface Command {
  data: any;
  execute: (interaction: any) => Promise<void>;
}

(global as any).botState = { lockdownMode: false };

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

const commands = new Collection<string, Command>();

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

async function registerCommands() {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!token || !clientId) { console.error('Missing env vars'); process.exit(1); }
  const rest = new REST().setToken(token);
  const commandData = Array.from(commands.values()).map(cmd => cmd.data.toJSON());
  try {
    await rest.put(Routes.applicationCommands(clientId), { body: commandData });
    console.log('<:cottage:1457128646274973766> Successfully registered slash commands!');
  } catch (error) { console.error('Error registering commands:', error); }
}

client.once(Events.ClientReady, async () => {
  console.log(`✨ Bot is online as ${client.user?.username}`);
  client.user?.setActivity('RUDE!', { type: ActivityType.Streaming, url: 'https://www.youtube.com/watch?v=Q4AE3ub4nBM' });
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isButton()) {
    const customId = interaction.customId;

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
        const row = interaction.message.components[0] as any;
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
            getInteger: (name: string) => (name === 'page' ? newPage : name === 'rarity' ? rarityFilter : null),
            getString: (name: string) => {
              if (name === 'group') return groupFilter === 'all' ? null : groupFilter;
              if (name === 'era') return eraFilter === 'all' ? null : eraFilter;
              if (name === 'idol') return idolFilter === 'all' ? null : idolFilter;
              if (name === 'search') return searchFilter === 'all' ? null : searchFilter;
              return null;
            },
            getBoolean: () => null
          }
        };
        await command.execute(mockInteraction as any);
      }
      return;
    }

    if (customId.startsWith('cardid_')) {
      const parts = customId.split('_');
      const action = parts[1];
      if (action === 'page') return;

      const userId = parts[2];
      const command = commands.get('cardid');
      if (command) {
        await interaction.deferUpdate();
        const row = interaction.message.components[0] as any;
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
            getInteger: (name: string) => (name === 'page' ? newPage : null),
            getString: () => null,
            getBoolean: () => null
          }
        };
        await command.execute(mockInteraction as any);
      }
      return;
    }

    if (customId.startsWith('search_')) {
      // Search buttons are handled within the search command itself
      // This is a fallback just in case
      return;
    }

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
        await command.execute(mockInteraction as any);
      }
      return;
    }
  }

  if (!interaction.isChatInputCommand()) return;
  const command = commands.get(interaction.commandName);
  if (!command) return;

  // Fetch user language preference safely
  const { data: userData, error: langError } = await supabase
    .from('users')
    .select('*')
    .eq('user_id', interaction.user.id)
    .maybeSingle();

  (interaction as any).userLanguage = (userData as any)?.language || 'en';

  try { await command.execute(interaction); } catch (error) { console.error(error); }
});

const PORT = process.env.PORT || 3000;

const PORT = process.env.PORT || 3000;

const server = createServer((req, res) => {
  res.writeHead(200);
  res.end('Bot is running');
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 Web server running on port ${PORT}`);
});

async function start() {
  await loadCommands();
  await registerCommands();
  await client.login(process.env.DISCORD_TOKEN);
}

start();