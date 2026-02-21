import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { supabase } from '../database/supabase.js';
import { getTranslation } from '../utils/language.js';

export const data = new SlashCommandBuilder()
  .setName('balance')
  .setDescription('Check your coin balance')
  .addUserOption(option =>
    option.setName('user')
      .setDescription('User to check balance for (default: yourself)')
      .setRequired(false));

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  
  const targetUser = interaction.options.getUser('user') || interaction.user;
  const userId = targetUser.id;

  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (!user) {
    const lang = (interaction as any).userLanguage || 'en';
    await interaction.editReply({ 
      content: getTranslation(lang, targetUser.id === interaction.user.id ? 'start_prompt' : 'not_started')
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0xff69b4)
    .setTitle(user.language === 'es' ? `Saldo de ${targetUser.username}` : `${targetUser.username}'s Balance`)
    .setDescription(`🧚 **${user.coins}** ${user.language === 'es' ? 'monedas' : 'coins'}`)
    .setThumbnail(targetUser.displayAvatarURL());

  await interaction.editReply({ embeds: [embed] });
}
