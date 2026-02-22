import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
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
  
  // Check for column existence before attempting update
  // Since we can't easily check schema via client, we'll use a safer approach
  // and handle the specific "column not found" error if it occurs.
  
  const { error } = await supabase
    .from('users')
    .update({ language: lang } as any)
    .eq('user_id', interaction.user.id);

  if (error) {
    console.error('Error setting language:', error);
    return interaction.reply({ content: 'Error saving language preference. Please ensure you have run `/start` and the database is initialized.', flags: [MessageFlags.Ephemeral] });
  }

  const message = getTranslation(lang, 'language_set');
  await interaction.reply({ content: message, ephemeral: true });
}
