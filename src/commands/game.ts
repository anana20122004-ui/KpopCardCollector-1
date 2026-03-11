import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, TextChannel } from 'discord.js';
import { supabase } from '../database/supabase.js';

export const data = new SlashCommandBuilder()
  .setName('game')
  .setDescription('Play a K-pop guessing game')
  .addSubcommand(subcommand =>
    subcommand
      .setName('idol')
      .setDescription('Guess the idol from an image'))
  .addSubcommand(subcommand =>
    subcommand
      .setName('group')
      .setDescription('Guess the group from an image'));

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const subcommand = interaction.options.getSubcommand();
  const isIdolMode = subcommand === 'idol';
  const type = isIdolMode ? 'idol' : 'group';
  
  const { data: questions } = await supabase.from('quiz_questions').select('*').eq('type', type);

  if (!questions || questions.length === 0) {
    return interaction.editReply(`❌ No quiz questions found for ${isIdolMode ? 'idol' : 'group'} guessing! Add some using /addquestion first.`);
  }
  
  const randomQuestion = questions[Math.floor(Math.random() * questions.length)];
  await startGame(interaction, randomQuestion.image_url, randomQuestion.answer, randomQuestion.reward_coins, isIdolMode);
}

async function startGame(interaction: ChatInputCommandInteraction, imageUrl: string, targetName: string, reward: number, isIdolMode: boolean) {
  const embed = new EmbedBuilder()
    .setTitle(`Guess the ${isIdolMode ? 'Idol' : 'Group'}!`)
    .setDescription(`Type the name of the ${isIdolMode ? 'idol' : 'group'} below. You have 30 seconds!`)
    .setColor(0xff69b4)
    .setImage(imageUrl);

  await interaction.editReply({ embeds: [embed] });
  
  const userId = interaction.user.id;
  const channel = interaction.channel;
  if (!channel || !('send' in channel)) return;

  const answer = targetName.trim().toLowerCase();
  const guild = interaction.guild;
  
  // Use message event listener instead of collector
  const handleMessage = async (m: any) => {
    if (m.author.bot) return;
    
    const guess = (m.content || '').trim().toLowerCase();
    console.log(`Message: "${m.content}" -> guess: "${guess}" (answer: "${answer}")`);
    
    if (guess && guess === answer) {
      console.log('Correct answer detected!');
      interaction.client.off('messageCreate', handleMessage);
      const { data: user } = await supabase.from('users').select('coins').eq('user_id', m.author.id).single();
      if (user) await supabase.from('users').update({ coins: (user.coins || 0) + reward }).eq('user_id', m.author.id);
      await m.reply(`✅ Correct! It's **${targetName}**! You earned 🧚 **${reward}** coins!`);
    }
  };
  
  interaction.client.on('messageCreate', handleMessage);
  
  setTimeout(() => {
    interaction.client.off('messageCreate', handleMessage);
    interaction.followUp(`⏰ Time's up! The answer was **${targetName}**.`);
  }, 30000);
}
