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
  
  const channel = interaction.channel;
  if (!channel || !('send' in channel)) return;

  const answer = targetName.trim().toLowerCase();
  let answered = false;
  
  const handleMessage = async (m: any) => {
    // Skip bots and messages in wrong channel
    if (m.author.bot || m.channelId !== channel.id) return;
    if (answered) return;
    
    const guess = (m.content || '').trim().toLowerCase();
    console.log(`[GAME] Message: "${m.content}" | Guess: "${guess}" | Answer: "${answer}"`);
    
    if (guess === answer) {
      console.log('[GAME] ✅ Correct answer!');
      answered = true;
      interaction.client.off('messageCreate', handleMessage);
      
      try {
        const { data: user } = await supabase.from('users').select('coins').eq('user_id', m.author.id).single();
        if (user) {
          await supabase.from('users').update({ coins: (user.coins || 0) + reward }).eq('user_id', m.author.id);
        }
        await m.reply(`✅ Correct! It's **${targetName}**! You earned 🧚 **${reward}** coins!`);
      } catch (e) {
        console.error('[GAME] Error processing correct answer:', e);
      }
    }
  };
  
  interaction.client.on('messageCreate', handleMessage);
  
  const timeoutId = setTimeout(async () => {
    if (!answered) {
      interaction.client.off('messageCreate', handleMessage);
      try {
        await interaction.followUp(`⏰ Time's up! The answer was **${targetName}**.`);
      } catch (e) {
        console.error('[GAME] Error sending timeout message:', e);
      }
    }
  }, 30000);
}
