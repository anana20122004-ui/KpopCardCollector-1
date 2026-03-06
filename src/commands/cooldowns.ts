import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { supabase } from '../database/supabase.js';
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

  const now = Date.now();
  const cdEmoji = '<:cd:1479606121042808843>';

  const getCDStatus = (lastTime: string | null, cooldownHours: number) => {
    if (!lastTime) return lang === 'es' ? '✅ ¡Listo!' : '✅ Ready!';
    const cooldownMs = cooldownHours * 60 * 60 * 1000;
    const elapsed = now - new Date(lastTime).getTime();
    if (elapsed >= cooldownMs) return lang === 'es' ? '✅ ¡Listo!' : '✅ Ready!';
    return `<t:${Math.floor((new Date(lastTime).getTime() + cooldownMs) / 1000)}:R>`;
  };

  // Cooldowns in hours
  const dailyStatus = getCDStatus(user.last_daily, 24);
  const weeklyStatus = getCDStatus(user.last_weekly, 168);
  const exploreStatus = getCDStatus(user.last_explore, 1);
  const dropStatus = getCDStatus(user.last_drop, 2 / 60); // 2 minutes

  const description = [
    `${cdEmoji} **${lang === 'es' ? 'Recompensa Diaria' : 'Daily Rewards'}**`,
    dailyStatus,
    '',
    `${cdEmoji} **${lang === 'es' ? 'Recompensa Semanal' : 'Weekly Rewards'}**`,
    weeklyStatus,
    '',
    `${cdEmoji} **${lang === 'es' ? 'Exploración' : 'Explore'}**`,
    exploreStatus,
    '',
    `${cdEmoji} **Drop**`,
    dropStatus
  ].join('\n');

  const embed = new EmbedBuilder()
    .setColor(0xff69b4)
    .setTitle(getTranslation(lang, 'cooldowns_title'))
    .setDescription(description);

  await interaction.editReply({ embeds: [embed] });
}
