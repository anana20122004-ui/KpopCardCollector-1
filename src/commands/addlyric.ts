import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { supabase } from '../database/supabase.js';
import { isAdminUser } from '../utils/constants.js';
import { formatS2UCoins } from '../utils/currency.js';
import { countWords } from '../utils/lyrics.js';

export const data = new SlashCommandBuilder()
  .setName('addlyric')
  .setDescription('Add an English lyric snippet for the guessing game')
  .addStringOption(option =>
    option
      .setName('prompt')
      .setDescription('English lyric words shown to players')
      .setMaxLength(1000)
      .setRequired(true))
  .addStringOption(option =>
    option
      .setName('answer')
      .setDescription('The next 2–6 words')
      .setMaxLength(100)
      .setRequired(true))
  .addStringOption(option =>
    option
      .setName('source')
      .setDescription('Song title or source, if useful')
      .setMaxLength(100))
  .addIntegerOption(option =>
    option
      .setName('reward')
      .setDescription('S2UCoins reward for a correct answer')
      .setMinValue(1)
      .setMaxValue(10000));

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!isAdminUser(interaction.member)) {
    return interaction.editReply('This command is for staff only.');
  }

  const prompt = interaction.options.getString('prompt', true).trim();
  const answer = interaction.options.getString('answer', true).trim();
  const source = interaction.options.getString('source')?.trim() || null;
  const reward = interaction.options.getInteger('reward') ?? 50;
  const answerWordCount = countWords(answer);

  if (!prompt || answerWordCount < 2 || answerWordCount > 6) {
    return interaction.editReply('Add a prompt and an answer containing exactly 2–6 words.');
  }

  const { error } = await supabase
    .from('lyric_questions')
    .insert([{
      prompt,
      answer,
      source,
      language: 'en',
      reward_coins: reward,
      created_by: interaction.user.id
    }]);

  if (error) {
    console.error('[addlyric] Database error:', error);
    return interaction.editReply('Could not save the snippet. Check that the lyric database migration has been applied.');
  }

  return interaction.editReply(`English lyric snippet added with a ${formatS2UCoins(reward)} reward.`);
}
