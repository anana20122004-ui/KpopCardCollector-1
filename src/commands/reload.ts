import { ChatInputCommandInteraction, SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { getTranslation } from '../utils/language.js';
import { isAdminUser } from '../utils/constants.js';
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const data = new SlashCommandBuilder()
  .setName('reload')
  .setDescription('Reload and re-register all bot commands (Staff only)');

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!isAdminUser(interaction.member)) {
    return interaction.reply({ content: '💫 This command is for Staff only!', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const client = interaction.client;
    const commands: any[] = [];
    const commandsPath = path.join(__dirname, '../commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js') || file.endsWith('.ts'));

    console.log(`📦 Loading ${commandFiles.length} command files...`);

    for (const file of commandFiles) {
      const filePath = path.join(commandsPath, file);
      try {
        const command = await import(`file://${filePath}`);
        if (command.data && command.execute) {
          commands.push(command.data.toJSON());
        }
      } catch (e) {
        console.error(`Error loading command ${file}:`, e);
      }
    }

    if (commands.length === 0) {
      return interaction.editReply('❌ No commands found to reload!');
    }

    // Re-register commands with Discord
    const rest = new REST({ version: '10' }).setToken(client.token || '');
    const guildId = interaction.guildId;

    if (guildId) {
      // Register to guild (instant)
      console.log(`♻️ Registering ${commands.length} commands to guild ${guildId}...`);
      await rest.put(
        Routes.applicationGuildCommands(client.user?.id || '', guildId),
        { body: commands }
      );
    } else {
      // Register globally (takes up to 1 hour)
      console.log(`♻️ Registering ${commands.length} commands globally...`);
      await rest.put(
        Routes.applicationCommands(client.user?.id || ''),
        { body: commands }
      );
    }

    const embed = new EmbedBuilder()
      .setColor(0xCDECCB)
      .setTitle('✨ Commands Reloaded!')
      .addFields(
        { name: 'Commands Registered', value: `${commands.length}`, inline: true },
        { name: 'Scope', value: guildId ? 'Guild Only' : 'Global', inline: true },
        { name: 'Status', value: '✅ Success', inline: true }
      )
      .setDescription(guildId ? 'Commands updated instantly for this server!' : 'Commands registered globally (may take up to 1 hour to appear)');

    console.log(`✅ Successfully reloaded ${commands.length} commands!`);
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Error reloading commands:', error);
    await interaction.editReply(`❌ Error reloading commands: ${String(error)}`);
  }
}
