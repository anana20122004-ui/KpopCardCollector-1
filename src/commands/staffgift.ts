import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { supabase } from '../database/supabase.js';
import { getRarityEmoji } from '../utils/cards.js';

export const data = new SlashCommandBuilder()
  .setName('staffgift')
  .setDescription('Staff only: Gift cards to a user')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
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
  const senderUserId = interaction.user.id;
  const receiverUser = interaction.options.getUser('user', true);
  const receiverUserId = receiverUser.id;
  const OWNER_ID = '1403958587843149937';

  if (senderUserId !== OWNER_ID) return interaction.editReply({ content: '🧚 Owner only!' });

  const { data: receiver } = await supabase.from('users').select('*').eq('user_id', receiverUserId).single();
  if (!receiver) return interaction.editReply({ content: '🧚 User needs to use `/start`!' });

  const code1 = interaction.options.getString('card1', true);
  const amount1 = interaction.options.getInteger('amount1') || 1;

  const { data: card } = await supabase.from('cards').select('*').eq('cardcode', code1.toUpperCase()).maybeSingle();
  if (!card) return interaction.editReply({ content: '🧚 Card not found!' });

  const confirmEmbed = new EmbedBuilder()
    .setColor(0xFFB6D9)
    .setTitle('<:pink_bow:1508258538902786165> Confirm Staff Gift')
    .setDescription(`Do you want to gift **${amount1}** of **${card.name}** to <@${receiverUserId}>?`);

  if (card.image_url) confirmEmbed.setThumbnail(card.image_url);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`staffgift_confirm_${senderUserId}_${receiverUserId}_${card.card_id}_${amount1}`).setLabel('Yes').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`staffgift_cancel_${senderUserId}_${receiverUserId}`).setLabel('No').setStyle(ButtonStyle.Danger)
  );

  await interaction.editReply({ embeds: [confirmEmbed], components: [row] });
}
