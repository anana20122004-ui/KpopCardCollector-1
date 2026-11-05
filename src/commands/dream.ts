import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { supabase } from '../database/supabase.js';
import { formatCooldown } from '../utils/cooldowns.js';
import { formatS2UCoins } from '../utils/currency.js';
import { isAdminUser } from '../utils/constants.js';
import { scheduleReminder } from '../utils/reminders.js';

const DREAM_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

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
  .setDescription('Dream about idols and earn S2UCoins! ✨');

export async function execute(interaction: ChatInputCommandInteraction) {
  const lang = (interaction as any).userLanguage || 'en';
  const userId = interaction.user.id;
  const isStaff = isAdminUser(interaction.member);

  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (!user) {
    return interaction.editReply({ content: lang === 'es' ? '¡Usa `/start` primero!' : 'Use `/start` first!' });
  }

  // Use last_surf column (exists in schema) for dream cooldown
  if (!isStaff && user.last_surf) {
    const elapsed = Date.now() - new Date(user.last_surf).getTime();
    if (elapsed < DREAM_COOLDOWN_MS) {
      const remaining = DREAM_COOLDOWN_MS - elapsed;
      const embed = new EmbedBuilder()
        .setColor(0xFFB6E1)
        .setTitle(lang === 'es' ? '💤 Aún estás soñando...' : '💤 You\'re still dreaming...')
        .setDescription(lang === 'es'
          ? `Tus sueños están recargando. Intenta de nuevo en **${formatCooldown(remaining)}**`
          : `Your dreams are recharging. Try again in **${formatCooldown(remaining)}**`);
      return interaction.editReply({ embeds: [embed] });
    }
  }

  const reward = Math.floor(Math.random() * 3501) + 1000; // 1000–4500
  const newBalance = (user.coins || 0) + reward;
  const now = new Date().toISOString();

  const { error: updateError } = await supabase
    .from('users')
    .update({ coins: newBalance, last_surf: now })
    .eq('user_id', userId);

  if (updateError) {
    const { error: fallbackError } = await supabase
      .from('users')
      .update({ coins: newBalance })
      .eq('user_id', userId);
    if (fallbackError) {
      return interaction.editReply({ content: '❌ Something went wrong.' });
    }
  }

  const scenario = DREAM_SCENARIOS[Math.floor(Math.random() * DREAM_SCENARIOS.length)];
  const nextAvailable = new Date(Date.now() + DREAM_COOLDOWN_MS);
  const nextTimestamp = `<t:${Math.floor(nextAvailable.getTime() / 1000)}:R>`;

  const avatarUrl = interaction.user.displayAvatarURL({ size: 256 });
  const username = interaction.user.username;

  const description = lang === 'es'
    ? `${scenario}\n\n¡Ganaste ${formatS2UCoins(reward)}! Tu saldo ahora es ${formatS2UCoins(newBalance)}, vuelve ${isStaff ? 'cuando quieras' : nextTimestamp}`
    : `${scenario}\n\nYou earned ${formatS2UCoins(reward)}! Your balance is now ${formatS2UCoins(newBalance)}, come back ${isStaff ? 'whenever you want' : nextTimestamp}`;

  const footerText = isStaff
    ? (lang === 'es' ? '⚡ Ventaja de staff: sin cooldown' : '⚡ Staff perk: no cooldown')
    : '...';

  const embed = new EmbedBuilder()
    .setColor(0xD8A8E8)
    .setAuthor({ name: username, iconURL: avatarUrl })
    .setThumbnail(avatarUrl)
    .setTitle(lang === 'es' ? '🌙 ¡Tuviste un sueño!' : '🌙 You had a dream!')
    .setDescription(description)
    .setFooter({ text: footerText });

  if (!isStaff) {
    scheduleReminder(interaction.client, userId, interaction.channelId, 'dream', DREAM_COOLDOWN_MS);
  }

  await interaction.editReply({ embeds: [embed] });
}
