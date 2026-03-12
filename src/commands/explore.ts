import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { supabase } from '../database/supabase.js';
import { formatCooldown } from '../utils/cooldowns.js';
import { isAdminUser } from '../utils/constants.js';
import { scheduleReminder } from '../utils/reminders.js';
import { getTranslation } from '../utils/language.js';

const EXPLORE_COOLDOWN_HOURS = 1;

export const data = new SlashCommandBuilder()
  .setName('explore')
  .setDescription('Explore for coins!');

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const lang = (interaction as any).userLanguage || 'en';
  const userId = interaction.user.id;
  const reward = Math.floor(Math.random() * 1500) + 1500;
  
  // Pass the member object to check for both ID and Role
  const isStaff = isAdminUser(interaction.member);
  const cooldownHours = isStaff ? 0 : EXPLORE_COOLDOWN_HOURS;

  const { data, error } = await supabase.rpc('claim_explore_reward', {
    p_user_id: userId,
    p_reward: reward,
    p_cooldown_hours: cooldownHours
  });

  if (error) {
    console.error('Explore RPC Error:', error);
    return interaction.editReply({ content: getTranslation(lang, 'error_generic') });
  }

  const result = data as any;
  if (!result || !result.success) {
    if (result?.error === 'user_not_found') {
      return interaction.editReply({ content: getTranslation(lang, 'start_prompt') });
    }
    if (result?.error === 'on_cooldown') {
      const embed = new EmbedBuilder()
        .setColor(0xFFB6E1)
        .setTitle(getTranslation(lang, 'cooldown_title', { type: lang === 'es' ? 'Exploración' : 'Explore' }))
        .setDescription(getTranslation(lang, 'cooldown_wait', { time: formatCooldown(result.cooldown_remaining_ms) }));
      return interaction.editReply({ embeds: [embed] });
    }
    return interaction.editReply({ content: getTranslation(lang, 'error_generic') });
  }

  const cooldownMs = result.cooldown_remaining_ms || (EXPLORE_COOLDOWN_HOURS * 60 * 60 * 1000);
  const nextAvailable = new Date(Date.now() + (isStaff ? 0 : cooldownMs));
  
  const embed = new EmbedBuilder()
    .setColor(0xff69b4)
    .setTitle(getTranslation(lang, 'explore_title'))
    .setDescription(getTranslation(lang, 'explore_success', { reward: result.reward || reward }))
    .addFields(
      { name: getTranslation(lang, 'explore_field_reward'), value: `${result.reward || reward} ${lang === 'es' ? 'monedas' : 'coins'}`, inline: true },
      { name: getTranslation(lang, 'explore_field_balance'), value: `${result.new_balance} ${lang === 'es' ? 'monedas' : 'coins'}`, inline: true }
    );

  if (!isStaff) {
    embed.addFields({ name: getTranslation(lang, 'weekly_next'), value: `<t:${Math.floor(nextAvailable.getTime() / 1000)}:R>`, inline: true });
    scheduleReminder(interaction.client, userId, interaction.channelId, 'explore', EXPLORE_COOLDOWN_HOURS * 60 * 60 * 1000);
  } else {
    embed.addFields({ name: getTranslation(lang, 'staff_perk'), value: getTranslation(lang, 'no_cooldown'), inline: true });
  }

  await interaction.editReply({ embeds: [embed] });
}
