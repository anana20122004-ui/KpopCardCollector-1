import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { DEV_USER_ID } from '../utils/constants.js';

export const data = new SlashCommandBuilder()
  .setName('lockdown')
  .setDescription('Toggle lockdown mode (Dev only)');

export async function execute(interaction: ChatInputCommandInteraction) {
  if (interaction.user.id !== DEV_USER_ID) return interaction.reply({ content: '🧚 Dev only!', ephemeral: true });

  const state = (global as any).botState = (global as any).botState || {};
  state.lockdownMode = !state.lockdownMode;

  const embed = new EmbedBuilder()
    .setColor(state.lockdownMode ? 0xF2C4C4 : 0xCDECCB)
    .setTitle(state.lockdownMode ? '🔒 LOCKDOWN ENABLED' : '🔓 Lockdown Disabled')
    .setDescription(state.lockdownMode ? 'Commands are now **LOCKED**.' : 'Commands are now **UNLOCKED**.');

  await interaction.reply({ embeds: [embed] });
}
