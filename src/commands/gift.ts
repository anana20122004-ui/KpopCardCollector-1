import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { supabase } from '../database/supabase.js';
import { getRarityEmoji } from '../utils/cards.js';
import { getTranslation } from '../utils/language.js';

export const data = new SlashCommandBuilder()
  .setName('gift')
  .setDescription('Gift cards to another user')
  .addUserOption(option =>
    option.setName('user')
      .setDescription('User to gift to')
      .setRequired(true))
  .addStringOption(option =>
    option.setName('card1')
      .setDescription('First card code')
      .setRequired(true))
  .addIntegerOption(option =>
    option.setName('amount1')
      .setDescription('Amount for first card')
      .setMinValue(1));

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const lang = (interaction as any).userLanguage || 'en';
  const senderUserId = interaction.user.id;
  const receiverUser = interaction.options.getUser('user', true);
  const receiverUserId = receiverUser.id;

  if (senderUserId === receiverUserId) return interaction.editReply({ content: getTranslation(lang, 'error_gift_self') });

  const { data: sender } = await supabase.from('users').select('*').eq('user_id', senderUserId).maybeSingle();
  const { data: receiver } = await supabase.from('users').select('*').eq('user_id', receiverUserId).maybeSingle();

  if (!sender) return interaction.editReply({ content: getTranslation(lang, 'start_prompt') });
  if (!receiver) return interaction.editReply({ content: lang === 'es' ? `🧚 ¡${receiverUser.username} necesita usar \`/start\` primero!` : `🧚 ${receiverUser.username} needs to use \`/start\` first!` });

  const code1 = interaction.options.getString('card1', true).toUpperCase();
  const amount1 = interaction.options.getInteger('amount1') || 1;

  const { data: card } = await supabase.from('cards').select('*').eq('cardcode', code1).maybeSingle();
  if (!card) return interaction.editReply({ content: getTranslation(lang, 'not_enough_cards') });

  const { data: inv } = await supabase.from('inventory').select('*').eq('user_id', senderUserId).eq('card_id', card.card_id).maybeSingle();
  if (!inv || inv.quantity < amount1) return interaction.editReply({ content: getTranslation(lang, 'error_insufficient_cards', { qty: inv?.quantity || 0 }) });

  const rarityEmoji = getRarityEmoji(card.rarity);
  const confirmEmbed = new EmbedBuilder()
    .setColor(0xFFB6E1)
    .setTitle(getTranslation(lang, 'gift_confirm_title'))
    .setDescription(getTranslation(lang, 'gift_confirm_desc', { amount: amount1, name: card.name, group: card.group, emoji: rarityEmoji, user: receiverUser.username }));

  if (card.image_url) confirmEmbed.setThumbnail(card.image_url);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`gift_confirm_${senderUserId}_${receiverUserId}_${card.card_id}:${amount1}`).setLabel(lang === 'es' ? 'Sí' : 'Yes').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`gift_cancel_${senderUserId}`).setLabel(lang === 'es' ? 'No' : 'No').setStyle(ButtonStyle.Danger)
  );

  await interaction.editReply({ embeds: [confirmEmbed], components: [row] });
}
