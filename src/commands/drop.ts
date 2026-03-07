import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { supabase } from '../database/supabase.js';
import { getRandomRarity, getRarityColor, getRarityEmoji } from '../utils/cards.js';
import { isAdminUser } from '../utils/constants.js';
import { scheduleReminder } from '../utils/reminders.js';
import { mergeCardImages } from '../utils/imageUtils.js';
import { getTranslation } from '../utils/language.js';

const COOLDOWN_MINUTES = 5;

export const data = new SlashCommandBuilder()
  .setName('drop')
  .setDescription('Reveal 3 magical cards and choose one to claim!');

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const userId = interaction.user.id;
  const lang = (interaction as any).userLanguage || 'en';

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (userError || !user) {
    return interaction.editReply({ content: getTranslation(lang, 'start_prompt') });
  }

  const lastDrop = user.last_drop ? new Date(user.last_drop).getTime() : 0;
  if (!isAdminUser(userId) && Date.now() - lastDrop < COOLDOWN_MINUTES * 60 * 1000) {
    const remaining = Math.ceil((COOLDOWN_MINUTES * 60 * 1000 - (Date.now() - lastDrop)) / 1000);
    return interaction.editReply({ content: getTranslation(lang, 'drop_wait', { time: remaining }) });
  }

  const { data: allCards } = await supabase.from('cards').select('*').eq('droppable', true);
  if (!allCards || allCards.length < 3) return interaction.editReply(getTranslation(lang, 'not_enough_cards'));

  const selectedCards: any[] = [];
  for (let i = 0; i < 3; i++) {
    const rarity = getRandomRarity();
    let pool = allCards.filter(c => c.rarity === rarity);
    if (pool.length === 0) pool = allCards;
    selectedCards.push(pool[Math.floor(Math.random() * pool.length)]);
  }

  let attachment = null;
  try {
    const images = selectedCards.map(c => c.image_url).filter(Boolean);
    if (images.length > 0) {
      const buffer = await mergeCardImages(images);
      attachment = new AttachmentBuilder(buffer, { name: 'drop.png' });
    }
  } catch (e) { console.error(e); }

  const cardList = selectedCards.map((c, i) => {
    const eraText = c.era ? ` (${c.era})` : '';
    const imageLink = c.image_url || 'https://via.placeholder.com/150';
    return `**${i + 1}.** [${c.name}](${imageLink}) - __${c.group}__${eraText}`;
  }).join('\n');

  const embed = new EmbedBuilder()
    .setColor(0xff69b4)
    .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
    .setDescription(cardList);

  if (attachment) embed.setImage('attachment://drop.png');

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('claim_0').setLabel(getTranslation(lang, 'drop_claim_button', { num: 1 })).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('claim_1').setLabel(getTranslation(lang, 'drop_claim_button', { num: 2 })).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('claim_2').setLabel(getTranslation(lang, 'drop_claim_button', { num: 3 })).setStyle(ButtonStyle.Primary)
  );

  const msg = await interaction.editReply({ embeds: [embed], components: [row], files: attachment ? [attachment] : [] });
  const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30000 });

  collector.on('collect', async i => {
    if (i.user.id !== userId) return i.reply({ content: getTranslation(lang, 'wrong_user_cards'), ephemeral: true });
    
    await i.deferUpdate();
    const index = parseInt(i.customId.split('_')[1]);
    const card = selectedCards[index];

    const { data: ex } = await supabase.from('inventory').select('*').eq('user_id', userId).eq('card_id', card.card_id).maybeSingle();
    if (ex) await supabase.from('inventory').update({ quantity: (ex as any).quantity + 1 }).eq('id', (ex as any).id);
    else await supabase.from('inventory').insert({ user_id: userId, card_id: card.card_id, quantity: 1 });

    await supabase.from('users').update({ last_drop: new Date().toISOString() }).eq('user_id', userId);

    const resultEmbed = new EmbedBuilder()
      .setColor(getRarityColor(card.rarity))
      .setTitle(getTranslation(lang, 'drop_claimed_title'))
      .setDescription(getTranslation(lang, 'drop_claimed_desc', { emoji: getRarityEmoji(card.rarity), name: card.name, group: card.group, code: card.cardcode }));
    
    if (card.image_url) resultEmbed.setImage(card.image_url);
    
    await i.editReply({ embeds: [resultEmbed], components: [], files: [] });
    scheduleReminder(interaction.client, userId, interaction.channelId, 'drop', COOLDOWN_MINUTES * 60 * 1000);
    collector.stop();
  });

  collector.on('end', async (_, reason) => {
    if (reason === 'time') {
      const expiredEmbed = new EmbedBuilder()
        .setColor(0xff69b4)
        .setDescription(cardList)
        .setTitle(lang === 'es' ? '⏰ ¡Tiempo Expirado!' : '⏰ Expired!');
      if (attachment) expiredEmbed.setImage('attachment://drop.png');
      await interaction.editReply({ embeds: [expiredEmbed], components: [], files: attachment ? [attachment] : [] });
    }
  });
}

