import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { supabase } from '../database/supabase.js';
import { getTranslation } from '../utils/language.js';

export const data = new SlashCommandBuilder()
  .setName('start')
  .setDescription('Start collecting cards!');

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const userId = interaction.user.id;
  const lang = (interaction as any).userLanguage || 'en';

  // Use maybeSingle() and check if data exists
  const { data: existing, error: fetchError } = await supabase
    .from('users')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchError) {
    console.error('Error fetching user:', fetchError);
    return interaction.editReply(getTranslation(lang, 'start_error_check'));
  }

  if (existing) {
    const embed = new EmbedBuilder()
      .setColor(0xff69b4)
      .setTitle(getTranslation(lang, 'start_title_welcome'))
      .setDescription(getTranslation(lang, 'start_desc_welcome', { coins: existing.coins }))
      .addFields(
        { name: getTranslation(lang, 'start_field_total_cards'), value: getTranslation(lang, 'start_field_inventory_hint') },
        { name: getTranslation(lang, 'coins_label'), value: `${existing.coins}` }
      );
    return interaction.editReply({ embeds: [embed] });
  }

  const { error: insertError } = await supabase
    .from('users')
    .insert([{ user_id: userId, coins: 100, language: lang }]);

  if (insertError) {
    console.error('Error creating user:', insertError);
    return interaction.editReply(getTranslation(lang, 'start_error_create'));
  }

  const embed = new EmbedBuilder()
    .setColor(0xff69b4)
    .setTitle(getTranslation(lang, 'start_title_new'))
    .setDescription(getTranslation(lang, 'start_desc_new'))
    .addFields({ name: getTranslation(lang, 'start_field_coins'), value: '100' });

  await interaction.editReply({ embeds: [embed] });
}
