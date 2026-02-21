import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { supabase } from '../database/supabase.js';
import { getTranslation } from '../utils/language.js';

export const data = new SlashCommandBuilder()
  .setName('language')
  .setDescription('Set your preferred language / Configura tu idioma preferido')
  .addStringOption(option =>
    option.setName('lang')
      .setDescription('The language to use')
      .setRequired(true)
      .addChoices(
        { name: 'English', value: 'en' },
        { name: 'Español', value: 'es' }
      ));

export async function execute(interaction: ChatInputCommandInteraction) {
  const lang = interaction.options.getString('lang', true) as 'en' | 'es';
  
  const { error } = await supabase
    .from('users')
    .upsert({ user_id: interaction.user.id, language: lang }, { onConflict: 'user_id' });

  if (error) {
    console.error('Error setting language:', error);
    return interaction.reply({ content: 'Error saving language preference.', ephemeral: true });
  }

  const message = getTranslation(lang, 'language_set');
  await interaction.reply({ content: message, ephemeral: true });
}
