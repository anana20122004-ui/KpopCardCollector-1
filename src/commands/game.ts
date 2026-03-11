import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
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

  if (!questions || questions.length < 4) {
    return interaction.editReply(`❌ Need at least 4 quiz questions for ${isIdolMode ? 'idol' : 'group'} guessing! Add more using /addquestion.`);
  }
  
  const randomQuestion = questions[Math.floor(Math.random() * questions.length)];
  const wrongAnswers: string[] = [];
  
  // Get 3 different wrong answers
  for (let i = 0; i < 3; i++) {
    let wrongQ = questions[Math.floor(Math.random() * questions.length)];
    while (wrongQ.answer === randomQuestion.answer || wrongAnswers.includes(wrongQ.answer)) {
      wrongQ = questions[Math.floor(Math.random() * questions.length)];
    }
    wrongAnswers.push(wrongQ.answer);
  }
  
  await startGame(interaction, randomQuestion.image_url, randomQuestion.answer, randomQuestion.reward_coins, isIdolMode, wrongAnswers);
}

async function startGame(interaction: ChatInputCommandInteraction, imageUrl: string, correctAnswer: string, reward: number, isIdolMode: boolean, wrongAnswers: string[]) {
  // Shuffle all 4 options
  const allOptions = [correctAnswer, ...wrongAnswers].sort(() => Math.random() - 0.5);
  
  const embed = new EmbedBuilder()
    .setTitle(`Guess the ${isIdolMode ? 'Idol' : 'Group'}!`)
    .setColor(0xff69b4)
    .setImage(imageUrl);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`answer_0`).setLabel(allOptions[0]).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`answer_1`).setLabel(allOptions[1]).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`answer_2`).setLabel(allOptions[2]).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`answer_3`).setLabel(allOptions[3]).setStyle(ButtonStyle.Primary)
  );

  const msg = await interaction.editReply({ embeds: [embed], components: [row] });
  const userId = interaction.user.id;
  let attempts = 0;

  const collector = msg.createMessageComponentCollector({ 
    componentType: ComponentType.Button, 
    time: 30000,
    filter: (i) => i.user.id === userId
  });

  collector.on('collect', async i => {
    const selectedAnswer = allOptions[parseInt(i.customId.split('_')[1])];
    attempts++;

    if (selectedAnswer === correctAnswer) {
      // Correct answer
      await i.update({ components: [] });
      collector.stop();
      
      try {
        const { data: user } = await supabase.from('users').select('coins').eq('user_id', userId).single();
        if (user) {
          await supabase.from('users').update({ coins: (user.coins || 0) + reward }).eq('user_id', userId);
        }
        await interaction.followUp(`✅ Correct! It's **${correctAnswer}**! You earned 🧚 **${reward}** coins!`);
      } catch (e) {
        console.error('[GAME] Error awarding coins:', e);
      }
    } else if (attempts === 1) {
      // Wrong answer, allow one more try with 50% coins
      const halfReward = Math.floor(reward / 2);
      const newRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`answer_0`).setLabel(allOptions[0]).setStyle(allOptions[0] === correctAnswer ? ButtonStyle.Success : ButtonStyle.Primary).setDisabled(allOptions[0] === selectedAnswer),
        new ButtonBuilder().setCustomId(`answer_1`).setLabel(allOptions[1]).setStyle(allOptions[1] === correctAnswer ? ButtonStyle.Success : ButtonStyle.Primary).setDisabled(allOptions[1] === selectedAnswer),
        new ButtonBuilder().setCustomId(`answer_2`).setLabel(allOptions[2]).setStyle(allOptions[2] === correctAnswer ? ButtonStyle.Success : ButtonStyle.Primary).setDisabled(allOptions[2] === selectedAnswer),
        new ButtonBuilder().setCustomId(`answer_3`).setLabel(allOptions[3]).setStyle(allOptions[3] === correctAnswer ? ButtonStyle.Success : ButtonStyle.Primary).setDisabled(allOptions[3] === selectedAnswer)
      );
      
      await i.update({ components: [newRow] });
      await interaction.followUp(`❌ Wrong! Try again for ${halfReward} coins!`);
    } else {
      // Second wrong answer, game over
      await i.update({ components: [] });
      collector.stop();
      await interaction.followUp(`❌ Game over! The answer was **${correctAnswer}**.`);
    }
  });

  collector.on('end', async (_, reason) => {
    if (reason === 'time') {
      try {
        await interaction.followUp(`⏰ Time's up! The answer was **${correctAnswer}**.`);
      } catch (e) {
        console.error('[GAME] Error sending timeout:', e);
      }
    }
  });
}
