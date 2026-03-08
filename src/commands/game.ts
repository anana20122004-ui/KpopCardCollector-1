import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, TextChannel, AttachmentBuilder } from 'discord.js';
import { supabase } from '../database/supabase.js';
import { blurImageBottom } from '../utils/imageUtils.js';

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
    const { data: cards } = await supabase.from('cards').select('*').limit(50);
    if (!cards || cards.length === 0) return interaction.editReply('No cards or quiz questions found!');
    
    const randomCard = cards[Math.floor(Math.random() * cards.length)];
    const targetName = isIdolMode ? randomCard.name : randomCard.group;
    await startGame(interaction, randomCard.image_url, targetName, 50, isIdolMode);
    return;
  }
  
  const randomQuestion = questions[Math.floor(Math.random() * questions.length)];
  await startGame(interaction, randomQuestion.image_url, randomQuestion.answer, randomQuestion.reward_coins, isIdolMode);
}

async function startGame(interaction: ChatInputCommandInteraction, imageUrl: string, targetName: string, reward: number, isIdolMode: boolean) {
  let attachment = null;
  try {
    const blurredBuffer = await blurImageBottom(imageUrl, 100);
    attachment = new AttachmentBuilder(blurredBuffer, { name: 'game.png' });
  } catch (e) {
    console.error('Error blurring image:', e);
  }

  const embed = new EmbedBuilder()
    .setTitle(`Guess the ${isIdolMode ? 'Idol' : 'Group'}!`)
    .setDescription(`Type the name of the ${isIdolMode ? 'idol' : 'group'} below. You have 30 seconds!`)
    .setColor(0xff69b4);

  if (attachment) {
    embed.setImage('attachment://game.png');
    await interaction.editReply({ embeds: [embed], files: [attachment] });
  } else {
    embed.setImage(imageUrl);
    await interaction.editReply({ embeds: [embed] });
  }
  
  const filter = (m: any) => !m.author.bot;
  const channel = interaction.channel;
  if (!channel || !('createMessageCollector' in channel)) {
    console.log('Channel type does not support message collection');
    return;
  }

  const collector = (channel as any).createMessageCollector({ filter, time: 30000 });
  console.log(`Game started. Waiting for answer: "${targetName.toLowerCase()}"`);
  
  collector.on('collect', async (m: any) => {
    const guess = m.content.trim().toLowerCase();
    const answer = targetName.trim().toLowerCase();
    console.log(`Message collected: "${guess}" (answer: "${answer}")`);
    
    if (guess === answer) {
      console.log('Correct answer detected!');
      collector.stop('correct');
      const { data: user } = await supabase.from('users').select('coins').eq('user_id', m.author.id).single();
      if (user) await supabase.from('users').update({ coins: (user.coins || 0) + reward }).eq('user_id', m.author.id);
      await m.reply(`✅ Correct! It's **${targetName}**! You earned 🧚 **${reward}** coins!`);
    }
  });
  
  collector.on('end', (_collected: any, reason: string) => {
    console.log(`Game ended. Reason: ${reason}`);
    if (reason !== 'correct') interaction.followUp(`⏰ Time's up! The answer was **${targetName}**.`);
  });
}
