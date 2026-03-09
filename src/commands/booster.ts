import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { supabase } from '../database/supabase.js';
import { formatCooldown } from '../utils/cooldowns.js';
import { mergeCardImages } from '../utils/imageUtils.js';
import { BOOSTER_ROLE_ID, isAdminUser } from '../utils/constants.js';
import { getTranslation } from '../utils/language.js';
import { filterBlockedCards } from '../utils/blockFilter.js';

const BOOSTER_COOLDOWN_HOURS = 6;

export const data = new SlashCommandBuilder()
  .setName('booster')
  .setDescription('Exclusive booster reward! (6 hour cooldown)');

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const lang = (interaction as any).userLanguage || 'en';
  const userId = interaction.user.id;

  const member = interaction.member as any;
  if (!isAdminUser(userId) && !member?.roles?.cache?.has(BOOSTER_ROLE_ID)) {
    return interaction.editReply({ content: lang === 'es' ? '🧚 ¡Solo para Boosters!' : '🧚 Boosters only!' });
  }

  const { data: user } = await supabase.from('users').select('*').eq('user_id', userId).maybeSingle();
  if (!user) return interaction.editReply({ content: getTranslation(lang, 'start_prompt') });

  const lastBooster = user.last_booster ? new Date(user.last_booster).getTime() : 0;
  if (!isAdminUser(userId) && Date.now() - lastBooster < BOOSTER_COOLDOWN_HOURS * 60 * 60 * 1000) {
    const remaining = (BOOSTER_COOLDOWN_HOURS * 60 * 60 * 1000) - (Date.now() - lastBooster);
    return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xff69b4).setTitle(getTranslation(lang, 'cooldown_title', { type: 'Booster' })).setDescription(getTranslation(lang, 'cooldown_wait', { time: formatCooldown(remaining) }))] });
  }

  const rewardCoins = 10000;
  const { data: allCards } = await supabase.from('cards').select('*').eq('droppable', true);

  if (!allCards || allCards.length === 0) {
    await supabase.from('users').update({ coins: user.coins + rewardCoins, last_booster: new Date().toISOString() }).eq('user_id', userId);
    return interaction.editReply({ content: getTranslation(lang, 'daily_success', { reward: rewardCoins }) });
  }

  const availableCards = await filterBlockedCards(allCards);
  if (availableCards.length === 0) {
    await supabase.from('users').update({ coins: user.coins + rewardCoins, last_booster: new Date().toISOString() }).eq('user_id', userId);
    return interaction.editReply({ content: getTranslation(lang, 'daily_success', { reward: rewardCoins }) });
  }

  const pulled = [];
  for (let i = 0; i < 15; i++) {
    const card = availableCards[Math.floor(Math.random() * availableCards.length)];
    pulled.push(card);
    const { data: ex } = await supabase.from('inventory').select('*').eq('user_id', userId).eq('card_id', card.card_id).maybeSingle();
    if (ex) await supabase.from('inventory').update({ quantity: (ex as any).quantity + 1 }).eq('id', (ex as any).id);
    else await supabase.from('inventory').insert({ user_id: userId, card_id: card.card_id, quantity: 1 });
  }

  await supabase.from('users').update({ coins: user.coins + rewardCoins, last_booster: new Date().toISOString() }).eq('user_id', userId);

  const embed = new EmbedBuilder()
    .setColor(0xff69b4)
    .setTitle(getTranslation(lang, 'booster_title'))
    .setDescription(getTranslation(lang, 'booster_desc', { reward: rewardCoins }));

  await interaction.editReply({ embeds: [embed] });
}
