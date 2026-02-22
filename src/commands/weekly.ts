import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { supabase } from '../database/supabase.js';
import { formatCooldown } from '../utils/cooldowns.js';
import { mergeCardImages } from '../utils/imageUtils.js';
import { getRarityEmoji } from '../utils/cards.js';
import { isAdminUser } from '../utils/constants.js';
import { scheduleReminder } from '../utils/reminders.js';
import { getTranslation } from '../utils/language.js';

const WEEKLY_REWARD = 1500;
const WEEKLY_COOLDOWN_HOURS = 168;

export const data = new SlashCommandBuilder()
  .setName('weekly')
  .setDescription('Claim your weekly coin reward!');

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const userId = interaction.user.id;
  const lang = (interaction as any).userLanguage || 'en';
  const cooldownHours = isAdminUser(userId) ? 0 : WEEKLY_COOLDOWN_HOURS;

  const { data, error } = await supabase.rpc('claim_weekly_reward', {
    p_user_id: userId,
    p_reward: WEEKLY_REWARD,
    p_cooldown_hours: cooldownHours
  });

  if (error || !data) return interaction.editReply({ content: getTranslation(lang, 'error_generic') });

  const result = data as any;
  if (!result.success) {
    if (result.error === 'user_not_found') return interaction.editReply({ content: getTranslation(lang, 'start_prompt') });
    if (result.error === 'on_cooldown') {
      const embed = new EmbedBuilder()
        .setColor(0xff69b4)
        .setTitle(getTranslation(lang, 'cooldown_title', { type: 'Weekly' }))
        .setDescription(getTranslation(lang, 'cooldown_wait', { time: formatCooldown(result.cooldown_remaining_ms) }));
      return interaction.editReply({ embeds: [embed] });
    }
    return interaction.editReply({ content: getTranslation(lang, 'error_generic') });
  }

  const { data: allCards } = await supabase.from('cards').select('*').eq('droppable', true);
  const nextAvailable = new Date(Date.now() + WEEKLY_COOLDOWN_HOURS * 60 * 60 * 1000);

  if (!allCards || allCards.length === 0) {
    return interaction.editReply({ content: getTranslation(lang, 'weekly_desc', { reward: result.reward, list: '(No cards found)' }) });
  }

  const selectedCards = [];
  for (let i = 0; i < 4; i++) {
    const card = allCards[Math.floor(Math.random() * allCards.length)];
    selectedCards.push(card);
    const { data: ex } = await supabase.from('inventory').select('*').eq('user_id', userId).eq('card_id', card.card_id).maybeSingle();
    if (ex) await supabase.from('inventory').update({ quantity: (ex as any).quantity + 1 }).eq('id', (ex as any).id);
    else await supabase.from('inventory').insert({ user_id: userId, card_id: card.card_id, quantity: 1 });
  }

  const list = selectedCards.map((c, i) => `**${i + 1}.** ${c.name} (${c.group}) ${getRarityEmoji(c.rarity)} • \`${c.cardcode}\``).join('\n');
  const embed = new EmbedBuilder()
    .setColor(0xff69b4)
    .setTitle(getTranslation(lang, 'weekly_title'))
    .setDescription(getTranslation(lang, 'weekly_desc', { reward: result.reward, list: list }))
    .addFields({ name: getTranslation(lang, 'weekly_next'), value: `<t:${Math.floor(nextAvailable.getTime() / 1000)}:R>` });

  scheduleReminder(interaction.client, userId, interaction.channelId, 'weekly', WEEKLY_COOLDOWN_HOURS * 60 * 60 * 1000);
  await interaction.editReply({ embeds: [embed] });
}
