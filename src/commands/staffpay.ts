import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { supabase } from '../database/supabase.js';
import { isAdminUser } from '../utils/constants.js';
import { formatS2UCoins } from '../utils/currency.js';

export const data = new SlashCommandBuilder()
  .setName('staffpay')
  .setDescription('Staff only: Send S2UCoins to a user')
  .addUserOption(option =>
    option.setName('user')
      .setDescription('User to pay')
      .setRequired(true))
  .addIntegerOption(option =>
    option.setName('amount')
      .setDescription('Number of S2UCoins to send')
      .setRequired(true)
      .setMinValue(1));

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  if (!isAdminUser(interaction.member)) return interaction.editReply({ content: '🧚 Staff only!' });

  const receiverUser = interaction.options.getUser('user', true);
  const amount = interaction.options.getInteger('amount', true);

  const { data: receiver } = await supabase.from('users').select('*').eq('user_id', receiverUser.id).single();
  if (!receiver) return interaction.editReply({ content: '🧚 User needs to use `/start`!' });

  await supabase.from('users').update({ coins: receiver.coins + amount }).eq('user_id', receiverUser.id);

  const embed = new EmbedBuilder()
    .setColor(0xFFB6E1)
    .setTitle('Staff Payment Sent!')
    .setDescription(`You sent ${formatS2UCoins(amount)} to ${receiverUser.username}!\n\n
Their new balance: ${formatS2UCoins(receiver.coins + amount)}`);

  await interaction.editReply({ embeds: [embed] });
}