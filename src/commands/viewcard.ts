import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { supabase } from '../database/supabase.js';
import { getRarityEmoji } from '../utils/cards.js';
import { getTranslation } from '../utils/language.js';

export const data = new SlashCommandBuilder()
  .setName('viewcard')
  .setDescription('View card information by card code')
  .addStringOption(option =>
    option.setName('cardcode')
      .setDescription('Card code (e.g., BP001)')
      .setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const lang = (interaction as any).userLanguage || 'en';
  const cardcode = interaction.options.getString('cardcode', true).toUpperCase();
  const { data: card } = await supabase.from('cards').select('*').eq('cardcode', cardcode).maybeSingle();

  if (!card) return interaction.editReply({ content: getTranslation(lang, 'not_enough_cards') });

  const { data: inv } = await supabase.from('inventory').select('*').eq('user_id', interaction.user.id).eq('card_id', card.card_id).maybeSingle();

  const qtyText = inv ? (lang === 'es' ? `• copias: **${inv.quantity}**` : `• copies: **${inv.quantity}**`) : '';
  const droppableText = card.droppable ? (lang === 'es' ? 'Sí' : 'Yes') : (lang === 'es' ? 'No' : 'No');

  const embed = new EmbedBuilder()
    .setColor(0xff69b4)
    .setTitle(getTranslation(lang, 'viewcard_title'))
    .setDescription(getTranslation(lang, 'viewcard_desc', { 
      name: card.name, 
      group: card.group, 
      emoji: getRarityEmoji(card.rarity), 
      era: card.era || 'N/A', 
      code: card.cardcode, 
      qty: qtyText 
    }))
    .setFooter({ text: getTranslation(lang, 'viewcard_footer', { rarity: card.rarity, droppable: droppableText }) });

  if (card.image_url) embed.setImage(card.image_url);
  await interaction.editReply({ embeds: [embed] });
}
