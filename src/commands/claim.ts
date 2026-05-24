import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { supabase } from '../database/supabase.js';
import { getRarityEmoji, getRarityColor } from '../utils/cards.js';
import { getTranslation } from '../utils/language.js';
import { scheduleReminder } from '../utils/reminders.js';
import { filterBlockedCards } from '../utils/blockFilter.js';

const COOLDOWN_MINUTES = 2;

export const data = new SlashCommandBuilder()
  .setName('claim')
  .setDescription('Claim one random card from the database!');

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const userId = interaction.user.id;
  const lang = (interaction as any).userLanguage || 'en';

  const { data: user } = await supabase.from('users').select('*').eq('user_id', userId).maybeSingle();
  if (!user) return interaction.editReply(getTranslation(lang, 'start_prompt'));

  const lastClaim = user.last_claim ? new Date(user.last_claim).getTime() : 0;
  if (Date.now() - lastClaim < COOLDOWN_MINUTES * 60 * 1000) {
    const remaining = Math.ceil((COOLDOWN_MINUTES * 60 * 1000 - (Date.now() - lastClaim)) / 1000);
    return interaction.editReply({ content: getTranslation(lang, 'drop_wait', { time: remaining }) });
  }

  const { data: allCards } = await supabase.from('cards').select('*').eq('droppable', true);
  if (!allCards || allCards.length === 0) return interaction.editReply(getTranslation(lang, 'not_enough_cards'));

  const availableCards = await filterBlockedCards(allCards, userId);
  if (availableCards.length === 0) return interaction.editReply(getTranslation(lang, 'not_enough_cards'));

  const card = availableCards[Math.floor(Math.random() * availableCards.length)];

  const { data: ex } = await supabase.from('inventory').select('*').eq('user_id', userId).eq('card_id', card.card_id).maybeSingle();
  if (ex) await supabase.from('inventory').update({ quantity: (ex as any).quantity + 1 }).eq('id', (ex as any).id);
  else await supabase.from('inventory').insert({ user_id: userId, card_id: card.card_id, quantity: 1 });

  await supabase.from('users').update({ last_claim: new Date().toISOString() }).eq('user_id', userId);

  const resultEmbed = new EmbedBuilder()
    .setColor(getRarityColor(card.rarity))
    .setTitle(getTranslation(lang, 'drop_claimed_title'))
    .setDescription(getTranslation(lang, 'drop_claimed_desc', { emoji: getRarityEmoji(card.rarity), name: card.name, group: card.group, code: card.cardcode }));

  if (card.image_url) resultEmbed.setImage(card.image_url);

  await interaction.editReply({ embeds: [resultEmbed] });
  scheduleReminder(interaction.client, userId, interaction.channelId, 'claim', COOLDOWN_MINUTES * 60 * 1000);
}
