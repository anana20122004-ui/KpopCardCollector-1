import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { supabase } from '../database/supabase.js';
import { getTranslation } from '../utils/language.js';

export const data = new SlashCommandBuilder()
  .setName('pay')
  .setDescription('Send S2UCoins to another user')
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
  const lang = (interaction as any).userLanguage || 'en';

  const senderUserId = interaction.user.id;
  const receiverUser = interaction.options.getUser('user', true);
  const receiverUserId = receiverUser.id;
  const amount = interaction.options.getInteger('amount', true);

  if (senderUserId === receiverUserId) {
    await interaction.editReply({ content: getTranslation(lang, 'error_pay_self') });
    return;
  }

  const { data: sender } = await supabase.from('users').select('*').eq('user_id', senderUserId).maybeSingle();
  const { data: receiver } = await supabase.from('users').select('*').eq('user_id', receiverUserId).maybeSingle();

  if (!sender) {
    await interaction.editReply({ content: getTranslation(lang, 'start_prompt') });
    return;
  }

  if (!receiver) {
    await interaction.editReply({ content: lang === 'es' ? `🧚 ¡${receiverUser.username} necesita usar \`/start\` primero!` : `🧚 ${receiverUser.username} needs to use \`/start\` first!` });
    return;
  }

  if (sender.coins < amount) {
    await interaction.editReply({ content: getTranslation(lang, 'error_insufficient_coins', { coins: sender.coins }) });
    return;
  }

  await supabase.from('users').update({ coins: sender.coins - amount }).eq('user_id', senderUserId);
  await supabase.from('users').update({ coins: (receiver.coins || 0) + amount }).eq('user_id', receiverUserId);

  const embed = new EmbedBuilder()
    .setColor(0xFFB6E1)
    .setTitle(getTranslation(lang, 'pay_title'))
    .setDescription(getTranslation(lang, 'pay_desc', { amount, user: receiverUser.username, balance: sender.coins - amount }));

  await interaction.editReply({ embeds: [embed] });
}
