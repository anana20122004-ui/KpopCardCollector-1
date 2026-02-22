import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { supabase } from '../database/supabase.js';
import { getCooldownRemaining, formatCooldown } from '../utils/cooldowns.js';
import { getTranslation } from '../utils/language.js';

export const data = new SlashCommandBuilder()
  .setName('cooldowns')
  .setDescription('Check all your command cooldowns');

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const lang = (interaction as any).userLanguage || 'en';
  const userId = interaction.user.id;

  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (!user) {
    await interaction.editReply({ content: getTranslation(lang, 'start_prompt') });
    return;
  }

  const dailyCooldown = getCooldownRemaining(user.last_daily, 24);
  const weeklyCooldown = getCooldownRemaining(user.last_weekly, 168);
  const exploreCooldown = getCooldownRemaining(user.last_surf, 1);
  const dropCooldown = getCooldownRemaining(user.last_drop, 0.0333);

  const embed = new EmbedBuilder()
    .setColor(0xff69b4)
    .setTitle(getTranslation(lang, 'cooldowns_title'))
    .addFields(
      { name: lang === 'es' ? '📅 Recompensa Diaria' : '📅 Daily Reward', value: formatCooldown(dailyCooldown) },
      { name: lang === 'es' ? '📆 Recompensa Semanal' : '📆 Weekly Reward', value: formatCooldown(weeklyCooldown) },
      { name: lang === 'es' ? '🧚 Explorar' : '🧚 Explore', value: formatCooldown(exploreCooldown) },
      { name: lang === 'es' ? '🦋 Drop' : '🦋 Drop', value: formatCooldown(dropCooldown) }
    )
    .setFooter({ text: getTranslation(lang, 'cooldowns_footer') });

  await interaction.editReply({ embeds: [embed] });
}
