import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { supabase } from '../database/supabase.js';
import { formatCooldown } from '../utils/cooldowns.js';
import { getRarityEmoji } from '../utils/cards.js';
import { isAdminUser } from '../utils/constants.js';
import { scheduleReminder } from '../utils/reminders.js';
import { getTranslation } from '../utils/language.js';
import { filterBlockedCards } from '../utils/blockFilter.js';

const MIN_COINS = 50;
const MAX_COINS = 100;
const DAILY_COOLDOWN_HOURS = 24;

export const data = new SlashCommandBuilder()
  .setName('daily')
  .setDescription('Claim your daily coin reward!');

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const userId = interaction.user.id;
  const lang = (interaction as any).userLanguage || 'en';

  const dailyReward = Math.floor(Math.random() * (MAX_COINS - MIN_COINS + 1)) + MIN_COINS;
  const cooldownHours = isAdminUser(userId) ? 0 : DAILY_COOLDOWN_HOURS;

  const { data, error } = await supabase.rpc('claim_daily_reward', {
    p_user_id: userId,
    p_reward: dailyReward,
    p_cooldown_hours: cooldownHours
  });

  if (error || !data) {
    await interaction.editReply({ content: getTranslation(lang, 'error_generic') });
    return;
  }

  const result = data as any;

  if (!result || !result.success) {
    if (result?.error === 'user_not_found') {
      await interaction.editReply({ content: getTranslation(lang, 'start_prompt') });
      return;
    }

    if (result?.error === 'on_cooldown') {
      const embed = new EmbedBuilder()
        .setColor(0xFFB6E1)
        .setTitle(getTranslation(lang, 'cooldown_title', { type: 'Daily' }))
        .setDescription(getTranslation(lang, 'cooldown_wait', { time: formatCooldown(result.cooldown_remaining_ms) }));

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    await interaction.editReply({ content: getTranslation(lang, 'error_generic') });
    return;
  }

  const { data: allCards } = await supabase.from('cards').select('*').eq('droppable', true);

  const embed = new EmbedBuilder()
    .setColor(0xff69b4)
    .setTitle(getTranslation(lang, 'daily_title'))
    .setDescription(getTranslation(lang, 'daily_success', { reward: dailyReward }));

  if (allCards && allCards.length > 0) {
    const availableCards = await filterBlockedCards(allCards, userId);
    if (availableCards.length > 0) {
      const selectedCard = availableCards[Math.floor(Math.random() * availableCards.length)];
      const { data: ex } = await supabase.from('inventory').select('*').eq('user_id', userId).eq('card_id', selectedCard.card_id).maybeSingle();
      if (ex) await supabase.from('inventory').update({ quantity: (ex as any).quantity + 1 }).eq('id', (ex as any).id);
      else await supabase.from('inventory').insert({ user_id: userId, card_id: selectedCard.card_id, quantity: 1 });

      embed.addFields({ name: getTranslation(lang, 'drop_claimed_title'), value: `${getRarityEmoji(selectedCard.rarity)} **${selectedCard.name}** (${selectedCard.group}) • \`${selectedCard.cardcode}\`` });
      if (selectedCard.image_url) embed.setImage(selectedCard.image_url);
    }
  }

  scheduleReminder(interaction.client, userId, interaction.channelId, 'daily', 24 * 60 * 60 * 1000);
  await interaction.editReply({ embeds: [embed] });
}
