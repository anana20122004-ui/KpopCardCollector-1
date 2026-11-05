import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { supabase } from '../database/supabase.js';
import { isAdminUser } from '../utils/constants.js';

export const data = new SlashCommandBuilder()
  .setName('addquestion')
  .setDescription('Add a quiz question (Staff only)')
  .addStringOption(option =>
    option.setName('type')
      .setDescription('Type of question')
      .setRequired(true)
      .addChoices(
        { name: 'Idol', value: 'idol' },
        { name: 'Group', value: 'group' }
      ))
  .addStringOption(option =>
    option.setName('image_url')
      .setDescription('URL of the image')
      .setRequired(true))
  .addStringOption(option =>
    option.setName('answer')
      .setDescription('The correct answer')
      .setRequired(true))
  .addIntegerOption(option =>
    option.setName('reward')
      .setDescription('S2UCoins reward for correct answer')
      .setRequired(false));

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!isAdminUser(interaction.member)) {
    return interaction.reply({ content: '💫 This command is for Staff only!', ephemeral: true });
  }

  await interaction.deferReply();
  
  try {
    const type = interaction.options.getString('type', true);
    const imageUrl = interaction.options.getString('image_url', true);
    const answer = interaction.options.getString('answer', true);
    const reward = interaction.options.getInteger('reward') || 50;

    const { error } = await supabase
      .from('quiz_questions')
      .insert([{ type, image_url: imageUrl, answer, reward_coins: reward }]);

    if (error) {
      console.error('Error adding question:', error);
      return interaction.editReply(`❌ Failed to add question: ${error.message}`);
    }

    await interaction.editReply(`✅ Added ${type} question: **${answer}** with ${reward} S2UCoins.`);
  } catch (error) {
    console.error('Unexpected error:', error);
    await interaction.editReply(`❌ Error: ${String(error)}`);
  }
}
