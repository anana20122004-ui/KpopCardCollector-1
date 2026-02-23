import { ChatInputCommandInteraction, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { getTranslation } from '../utils/language.js';

export const data = new SlashCommandBuilder()
  .setName('reload')
  .setDescription('Reload commands (Admin only)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: ChatInputCommandInteraction) {
  const lang = (interaction as any).userLanguage || 'en';
  await interaction.reply({ content: getTranslation(lang, 'reload_success'), ephemeral: true });
}
