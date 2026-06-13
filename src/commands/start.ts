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
      .setColor(0xFFB6E1)
      .setTitle(getTranslation(lang, 'start_title_welcome'))
      .setDescription(getTranslation(lang, 'start_desc_welcome', { coins: existing.coins }))
      .addFields(
        { name: getTranslation(lang, 'start_field_total_cards'), value: getTranslation(lang, 'start_field_inventory_hint') },
        { name: getTranslation(lang, 'coins_label'), value: `${existing.coins}` }
      );
    return interaction.editReply({ embeds: [embed] });
  }

  // Promotional starting bonus — 100,000 coins until June 26 2026, then 100
  const PROMO_END = new Date('2026-06-27T00:00:00Z');
  const startingCoins = Date.now() < PROMO_END.getTime() ? 100000 : 100;

  const { error: insertError } = await supabase
    .from('users')
    .insert([{ user_id: userId, coins: startingCoins }]);

  if (insertError) {
    console.error('Error creating user:', insertError);
    return interaction.editReply(getTranslation(lang, 'start_error_create'));
  }

  const embed = new EmbedBuilder()
    .setColor(0xff69b4)
    .setTitle(getTranslation(lang, 'start_title_new'))
    .setDescription(getTranslation(lang, 'start_desc_new'))
    .addFields({ name: getTranslation(lang, 'start_field_coins'), value: `${startingCoins.toLocaleString()}` });

  if (startingCoins === 100000) {
    embed.setFooter({ text: lang === 'es' ? '🎉 ¡Bono de lanzamiento! Expira el 26 de junio' : '🎉 Launch bonus! Expires June 26' });
  }

  await interaction.editReply({ embeds: [embed] });
}
