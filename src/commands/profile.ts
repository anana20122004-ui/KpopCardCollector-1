import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { supabase } from '../database/supabase.js';
import { getTranslation } from '../utils/language.js';

export const data = new SlashCommandBuilder()
  .setName('profile')
  .setDescription('View or edit your profile')
  .addSubcommand(s => s.setName('view').setDescription('View profile').addUserOption(o => o.setName('user').setDescription('User')))
  .addSubcommand(s => s.setName('bio').setDescription('Edit bio').addStringOption(o => o.setName('text').setDescription('Bio').setRequired(true).setMaxLength(200)))
  .addSubcommand(s => s.setName('color').setDescription('Edit color').addStringOption(o => o.setName('hex').setDescription('#hex').setRequired(true)));

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const lang = (interaction as any).userLanguage || 'en';
  const sub = interaction.options.getSubcommand();
  const userId = interaction.user.id;

  if (sub === 'view') {
    const target = interaction.options.getUser('user') || interaction.user;
    const { data: user } = await supabase.from('users').select('*').eq('user_id', target.id).single();
    if (!user) return interaction.editReply(getTranslation(lang, 'not_started'));
    
    const embed = new EmbedBuilder()
      .setColor(parseInt((user as any).profile_color?.replace('#', '') || 'ff69b4', 16))
      .setTitle(getTranslation(lang, 'profile_view_title', { user: target.username }))
      .setDescription((user as any).bio || getTranslation(lang, 'profile_no_bio'))
      .addFields({ name: getTranslation(lang, 'coins_label'), value: `${(user as any).coins}` });
    return interaction.editReply({ embeds: [embed] });
  }

  if (sub === 'bio') {
    const text = interaction.options.getString('text', true);
    await supabase.from('users').update({ bio: text }).eq('user_id', userId);
    return interaction.editReply(getTranslation(lang, 'profile_bio_updated'));
  }

  if (sub === 'color') {
    const hex = interaction.options.getString('hex', true);
    if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return interaction.editReply(getTranslation(lang, 'profile_invalid_hex'));
    await supabase.from('users').update({ profile_color: hex }).eq('user_id', userId);
    return interaction.editReply(getTranslation(lang, 'profile_color_updated'));
  }
}
