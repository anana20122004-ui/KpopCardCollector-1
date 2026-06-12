import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { supabase } from '../database/supabase.js';
import { getRandomRarity, getRarityColor, getRarityEmoji } from '../utils/cards.js';
import { isAdminUser } from '../utils/constants.js';
import { scheduleReminder } from '../utils/reminders.js';
import { mergeCardImages } from '../utils/imageUtils.js';
import { getTranslation } from '../utils/language.js';
import { filterBlockedCards } from '../utils/blockFilter.js';

const COOLDOWN_MINUTES = 5;

function buildCardList(cards: any[], claimedBy: Map<number, string>): string {
  return cards.map((c, i) => {
    const eraText = c.era ? ` (${c.era})` : '';
    const imageLink = c.image_url || 'https://via.placeholder.com/150';
    const base = `**${i + 1}.** [${c.name}](${imageLink}) — __${c.group}__${eraText}`;
    const claimer = claimedBy.get(i);
    return claimer ? `~~${base}~~ ✅ <@${claimer}>` : base;
  }).join('\n');
}

function buildRow(claimedBy: Map<number, string>, lang: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('claim_0')
      .setLabel(getTranslation(lang, 'drop_claim_button', { num: 1 }))
      .setStyle(claimedBy.has(0) ? ButtonStyle.Secondary : ButtonStyle.Primary)
      .setDisabled(claimedBy.has(0)),
    new ButtonBuilder()
      .setCustomId('claim_1')
      .setLabel(getTranslation(lang, 'drop_claim_button', { num: 2 }))
      .setStyle(claimedBy.has(1) ? ButtonStyle.Secondary : ButtonStyle.Primary)
      .setDisabled(claimedBy.has(1)),
    new ButtonBuilder()
      .setCustomId('claim_2')
      .setLabel(getTranslation(lang, 'drop_claim_button', { num: 3 }))
      .setStyle(claimedBy.has(2) ? ButtonStyle.Secondary : ButtonStyle.Primary)
      .setDisabled(claimedBy.has(2)),
  );
}

export const data = new SlashCommandBuilder()
  .setName('drop')
  .setDescription('Reveal 3 cards — anyone can claim one!');

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

  const availableCards = await filterBlockedCards(allCards, userId);
  if (availableCards.length < 3) return interaction.editReply(getTranslation(lang, 'not_enough_cards'));

  const selectedCards: any[] = [];
  for (let i = 0; i < 3; i++) {
    const rarity = getRandomRarity();
    let pool = availableCards.filter(c => c.rarity === rarity);
    if (pool.length === 0) pool = availableCards;
    selectedCards.push(pool[Math.floor(Math.random() * pool.length)]);
  }

  let attachment: AttachmentBuilder | null = null;
  try {
    const images = selectedCards.map(c => c.image_url).filter(Boolean);
    if (images.length > 0) {
      const buffer = await mergeCardImages(images, 3);
      attachment = new AttachmentBuilder(buffer, { name: 'drop.png' });
    }
  } catch (e) {
    console.error('Error merging drop images:', e);
  }

  // claimedBy: card index → userId who claimed it
  const claimedBy = new Map<number, string>();
  // claimedUsers: userIds who have already claimed a card this drop
  const claimedUsers = new Set<string>();

  const embed = new EmbedBuilder()
    .setColor(0xFFB6E1)
    .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
    .setDescription(buildCardList(selectedCards, claimedBy));

  if (attachment) embed.setImage('attachment://drop.png');

  const row = buildRow(claimedBy, lang);
  const msg = await interaction.editReply({
    embeds: [embed],
    components: [row],
    files: attachment ? [attachment] : [],
  });

  // Set dropper's cooldown immediately so they can't reuse /drop while cards are unclaimed
  await supabase.from('users').update({ last_drop: new Date().toISOString() }).eq('user_id', userId);
  scheduleReminder(interaction.client, userId, interaction.channelId, 'drop', COOLDOWN_MINUTES * 60 * 1000);

  const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

  collector.on('collect', async i => {
    const claimerLang = (i as any).userLanguage || lang;

    // One card per user per drop
    if (claimedUsers.has(i.user.id)) {
      return i.reply({ content: getTranslation(claimerLang, 'already_claimed'), ephemeral: true });
    }

    const index = parseInt(i.customId.split('_')[1]);

    // Card already taken (race condition guard)
    if (claimedBy.has(index)) {
      return i.reply({ content: getTranslation(claimerLang, 'card_already_claimed'), ephemeral: true });
    }

    // Claimer must have an account
    const { data: claimerUser } = await supabase
      .from('users')
      .select('user_id')
      .eq('user_id', i.user.id)
      .maybeSingle();

    if (!claimerUser) {
      return i.reply({ content: getTranslation(claimerLang, 'start_prompt'), ephemeral: true });
    }

    await i.deferUpdate();

    claimedBy.set(index, i.user.id);
    claimedUsers.add(i.user.id);

    const card = selectedCards[index];

    // Add card to claimer's inventory
    const { data: ex } = await supabase
      .from('inventory')
      .select('*')
      .eq('user_id', i.user.id)
      .eq('card_id', card.card_id)
      .maybeSingle();

    if (ex) {
      await supabase.from('inventory').update({ quantity: (ex as any).quantity + 1 }).eq('id', (ex as any).id);
    } else {
      await supabase.from('inventory').insert({ user_id: i.user.id, card_id: card.card_id, quantity: 1 });
    }

    // Notify claimer with an ephemeral card reveal
    const claimEmbed = new EmbedBuilder()
      .setColor(getRarityColor(card.rarity))
      .setAuthor({ name: i.user.username, iconURL: i.user.displayAvatarURL() })
      .setTitle(getTranslation(claimerLang, 'drop_claimed_title'))
      .addFields(
        { name: claimerLang === 'es' ? '🎤 Ídolo' : '🎤 Idol', value: card.name, inline: true },
        { name: claimerLang === 'es' ? '🎶 Grupo' : '🎶 Group', value: card.group, inline: true },
        { name: claimerLang === 'es' ? '✨ Rareza' : '✨ Rarity', value: getRarityEmoji(card.rarity), inline: true },
        ...(card.era ? [{ name: 'Era', value: card.era, inline: true }] : []),
        { name: claimerLang === 'es' ? '🏷️ Código' : '🏷️ Code', value: `\`${card.cardcode}\``, inline: true },
      );

    if (card.image_url) claimEmbed.setImage(card.image_url);

    await i.followUp({ embeds: [claimEmbed], ephemeral: true });

    // All 3 cards claimed — close the drop
    if (claimedBy.size === 3) {
      const doneEmbed = new EmbedBuilder()
        .setColor(0xFFB6E1)
        .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
        .setDescription(buildCardList(selectedCards, claimedBy))
        .setFooter({ text: lang === 'es' ? '¡Todas las cartas fueron reclamadas!' : 'All cards have been claimed!' });

      await i.editReply({ embeds: [doneEmbed], components: [], files: [] });
      collector.stop('all_claimed');
      return;
    }

    // Update drop message with remaining unclaimed cards
    const updatedEmbed = new EmbedBuilder()
      .setColor(0xFFB6E1)
      .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
      .setDescription(buildCardList(selectedCards, claimedBy));

    if (attachment) updatedEmbed.setImage('attachment://drop.png');

    await i.editReply({
      embeds: [updatedEmbed],
      components: [buildRow(claimedBy, lang)],
      files: attachment ? [attachment] : [],
    });
  });

  collector.on('end', async (_, reason) => {
    if (reason === 'time') {
      const expiredEmbed = new EmbedBuilder()
        .setColor(0xFFB6E1)
        .setDescription(buildCardList(selectedCards, claimedBy))
        .setTitle(lang === 'es' ? '⏰ ¡Tiempo Expirado!' : '⏰ Drop Expired!');

      await interaction.editReply({ embeds: [expiredEmbed], components: [], files: [] });
    }
  });
}
