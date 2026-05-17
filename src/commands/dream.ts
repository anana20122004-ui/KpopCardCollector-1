import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { supabase } from '../database/supabase.js';
import { formatCooldown } from '../utils/cooldowns.js';
import { isAdminUser } from '../utils/constants.js';
import { scheduleReminder } from '../utils/reminders.js';

const DREAM_COOLDOWN_HOURS = 1;

const DREAM_SCENARIOS = [
  'You dreamed you were a backup dancer for BLACKPINK on their world tour… the crowd went wild! 🌙',
  'You fell asleep and found yourself in a practice room with BTS, learning their choreography… 🌙',
  'In your dream, you were a trainee at HYBE and passed your first evaluation with flying colors! 🌙',
  'You dreamed of attending a secret fansign and your favorite idol remembered your name… 🌙',
  'You were cast as a music video extra for aespa and ended up stealing the scene… 🌙',
  'In your dream, you sat front row at a SEVENTEEN concert and they threw their towel to you! 🌙',
  'You dreamed you were a stylist for TWICE and dressed them for the Grammys… 🌙',
  'You fell into a dream where you co-wrote a song with IU that hit #1 on the charts! 🌙',
  'In your dream, you were scouted by SM Entertainment on the street… 🌙',
  'You dreamed of bumping into Stray Kids at a convenience store at 2am… 🌙',
  'You were a judge on a dream K-pop survival show and discovered the next big group! 🌙',
  'You dreamed of attending a secret after-party with NewJeans after their sold-out show! 🌙',
  'In your dream, LE SSERAFIM personally invited you to their dorm for dinner… 🌙',
  'You dreamed of singing karaoke with NMIXX until sunrise and winning every round! 🌙',
  'You were a VIP at a MAMAMOO reunion concert in your dream — every song was perfect! 🌙',
  'In your dream, aespa took you into the MY World and you got to explore it with them… 🌙',
  'You dreamed of going on a variety show with (G)I-DLE and winning every challenge! 🌙',
  'You fell asleep and woke up as the youngest member of a brand new SM group… 🌙',
  'In your dream, you and your bias explored a magical, starlit K-pop carnival together… 🌙',
  'You dreamed your fan letter was read out loud by your favorite idol on live stream… 🌙',
];

export const data = new SlashCommandBuilder()
  .setName('dream')
  .setDescription('Dream about idols and earn coins! ✨');

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const lang = (interaction as any).userLanguage || 'en';
  const userId = interaction.user.id;
  const reward = Math.floor(Math.random() * 3501) + 1000; // 1000–4500

  const isStaff = isAdminUser(interaction.member);
  const cooldownHours = isStaff ? 0 : DREAM_COOLDOWN_HOURS;

  const { data, error } = await supabase.rpc('claim_explore_reward', {
    p_user_id: userId,
    p_reward: reward,
    p_cooldown_hours: cooldownHours
  });

  if (error) {
    console.error('Dream RPC Error:', error);
    return interaction.editReply({ content: lang === 'es' ? '❌ Algo salió mal.' : '❌ Something went wrong.' });
  }

  const result = data as any;

  if (!result || !result.success) {
    if (result?.error === 'user_not_found') {
      return interaction.editReply({ content: lang === 'es' ? '¡Usa `/start` primero!' : 'Use `/start` first!' });
    }
    if (result?.error === 'on_cooldown') {
      const embed = new EmbedBuilder()
        .setColor(0xFFB6E1)
        .setTitle(lang === 'es' ? '💤 Aún estás soñando...' : '💤 You\'re still dreaming...')
        .setDescription(lang === 'es'
          ? `Tus sueños están recargando. Intenta de nuevo en **${formatCooldown(result.cooldown_remaining_ms)}**`
          : `Your dreams are recharging. Try again in **${formatCooldown(result.cooldown_remaining_ms)}**`);
      return interaction.editReply({ embeds: [embed] });
    }
    return interaction.editReply({ content: lang === 'es' ? '❌ Algo salió mal.' : '❌ Something went wrong.' });
  }

  const scenario = DREAM_SCENARIOS[Math.floor(Math.random() * DREAM_SCENARIOS.length)];
  const earnedCoins = result.reward || reward;
  const cooldownMs = DREAM_COOLDOWN_HOURS * 60 * 60 * 1000;
  const nextAvailable = new Date(Date.now() + (isStaff ? 0 : cooldownMs));

  const embed = new EmbedBuilder()
    .setColor(0xD8A8E8)
    .setTitle(lang === 'es' ? '🌙 ¡Tuviste un sueño!' : '🌙 You had a dream!')
    .setDescription(scenario)
    .addFields(
      { name: lang === 'es' ? '✨ Ganaste' : '✨ Earned', value: `**${earnedCoins}** coins`, inline: true },
      { name: lang === 'es' ? '💰 Saldo' : '💰 Balance', value: `**${result.new_balance}** coins`, inline: true }
    );

  if (!isStaff) {
    embed.addFields({ name: lang === 'es' ? '⏰ Próximo sueño' : '⏰ Next dream', value: `<t:${Math.floor(nextAvailable.getTime() / 1000)}:R>`, inline: true });
    scheduleReminder(interaction.client, userId, interaction.channelId, 'dream', cooldownMs);
  } else {
    embed.addFields({ name: '⚡ Staff Perk', value: 'No cooldown!', inline: true });
  }

  await interaction.editReply({ embeds: [embed] });
}
