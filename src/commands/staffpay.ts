import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { supabase } from '../database/supabase.js';

export const data = new SlashCommandBuilder()
  .setName('staffpay')
  .setDescription('Staff only: Send coins to a user')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addUserOption(option =>
    option.setName('user')
      .setDescription('User to pay')
      .setRequired(true))
  .addIntegerOption(option =>
    option.setName('amount')
      .setDescription('Number of coins to send')
      .setRequired(true)
      .setMinValue(1));

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const OWNER_ID = '1403958587843149937';
  if (interaction.user.id !== OWNER_ID) return interaction.editReply({ content: '🧚 Owner only!' });

  const receiverUser = interaction.options.getUser('user', true);
  const amount = interaction.options.getInteger('amount', true);

  const { data: receiver } = await supabase.from('users').select('*').eq('user_id', receiverUser.id).single();
  if (!receiver) return interaction.editReply({ content: '🧚 User needs to use `/start`!' });

  await supabase.from('users').update({ coins: receiver.coins + amount }).eq('user_id', receiverUser.id);

  const embed = new EmbedBuilder()
    .setColor(0xFFB6E1)
    .setTitle('💸 Staff Payment Sent!')
    .setDescription(`🌲 You sent **${amount} coins** to ${receiverUser.username}!\n\n💰 Their new balance: **${receiver.coins + amount} coins**`);

  await interaction.editReply({ embeds: [embed] });
}
