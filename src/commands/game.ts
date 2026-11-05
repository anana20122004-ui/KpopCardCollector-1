import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { supabase } from '../database/supabase.js';
import { formatS2UCoins } from '../utils/currency.js';
import { normalizeLyricAnswer } from '../utils/lyrics.js';

const activeLyricChannels = new Set<string>();
const LYRICS_ROUND_MS = 45_000;

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
      .setDescription('Guess the group from an image'))
  .addSubcommand(subcommand =>
    subcommand
      .setName('lyrics')
      .setDescription('Type the next 2–6 English lyric words'));

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === 'lyrics') {
    return startLyricsGame(interaction);
  }

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

async function startLyricsGame(interaction: ChatInputCommandInteraction) {
  const channel = interaction.channel as any;
  const channelId = interaction.channelId;

  if (!channel || typeof channel.createMessageCollector !== 'function') {
    return interaction.editReply('Start lyric games in a server text channel.');
  }

  if (activeLyricChannels.has(channelId)) {
    return interaction.editReply('A lyric round is already running in this channel.');
  }

  activeLyricChannels.add(channelId);
  const { data: questions, error } = await supabase
    .from('lyric_questions')
    .select('prompt, answer, reward_coins')
    .eq('language', 'en');

  if (error) {
    activeLyricChannels.delete(channelId);
    console.error('[game lyrics] Database error:', error);
    return interaction.editReply('Lyric mode is not set up yet. Apply the database migration and add snippets with `/addlyric`.');
  }

  if (!questions || questions.length === 0) {
    activeLyricChannels.delete(channelId);
    return interaction.editReply('No English lyric snippets yet. Staff can add one with `/addlyric`.');
  }

  const question = questions[Math.floor(Math.random() * questions.length)];
  const reward = Number(question.reward_coins ?? 50);

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xC8DDF2)
        .setTitle('Finish the Lyric')
        .setDescription(`**${question.prompt}**\n\nType the next **2–6 words** in chat. The first correct answer wins.`)
        .setFooter({ text: 'You have 45 seconds.' })
    ]
  });

  let winner: any = null;
  const collector = channel.createMessageCollector({
    time: LYRICS_ROUND_MS,
    filter: (message: any) => !message.author.bot
  });

  collector.on('collect', (message: any) => {
    if (winner || normalizeLyricAnswer(message.content) !== normalizeLyricAnswer(question.answer)) return;
    winner = message;
    collector.stop('solved');
  });

  collector.once('end', async () => {
    activeLyricChannels.delete(channelId);

    if (!winner) {
      await interaction.followUp(`Time is up! The next words were: **${question.answer}**.`);
      return;
    }

    const { data: award, error: rewardError } = await supabase.rpc('award_lyric_reward', {
      p_user_id: winner.author.id,
      p_reward: reward
    });

    if (rewardError) {
      console.error('[game lyrics] Reward RPC failed:', rewardError);
      await winner.reply('Correct, but the reward could not be saved. Please contact staff.');
      return;
    }

    if (!award?.success && award?.error === 'user_not_found') {
      await winner.reply('Correct! Use `/start` before earning S2UCoins.');
      return;
    }

    if (!award?.success) {
      console.error('[game lyrics] Unexpected award result:', award);
      await winner.reply('Correct, but the reward could not be saved. Please contact staff.');
      return;
    }

    await winner.reply(`Correct! You earned ${formatS2UCoins(reward)}.`);
  });
}

async function startGame(interaction: ChatInputCommandInteraction, imageUrl: string, correctAnswer: string, reward: number, isIdolMode: boolean, wrongAnswers: string[]) {
  // Shuffle all 4 options
  const allOptions = [correctAnswer, ...wrongAnswers].sort(() => Math.random() - 0.5);
  
  const embed = new EmbedBuilder()
    .setTitle(`Guess the ${isIdolMode ? 'Idol' : 'Group'}!`)
    .setColor(0xFFB6E1)
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
        await interaction.followUp(`✅ Correct! It's **${correctAnswer}**! You earned ${formatS2UCoins(reward)}.`);
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
      await interaction.followUp(`❌ Wrong! Try again for ${formatS2UCoins(halfReward)}.`);
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
