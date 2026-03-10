import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { supabase } from '../database/supabase.js';
import { getRarityEmoji } from '../utils/cards.js';

export const data = new SlashCommandBuilder()
  .setName('search')
  .setDescription('Search for cards in the database')
  .addStringOption(o => o.setName('idol').setDescription('Search by idol name').setRequired(false))
  .addStringOption(o => o.setName('group').setDescription('Filter by group').setRequired(false))
  .addStringOption(o => o.setName('era').setDescription('Filter by era').setRequired(false))
  .addIntegerOption(o => o.setName('rarity').setDescription('Filter by rarity').setRequired(false)
    .addChoices(
      { name: 'Common (1)', value: 1 },
      { name: 'Uncommon (2)', value: 2 },
      { name: 'Rare (3)', value: 3 },
      { name: 'Epic (4)', value: 4 },
      { name: 'Legendary (5)', value: 5 }
    ));

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const lang = (interaction as any).userLanguage || 'en';
  
  const idolName = interaction.options.getString('idol');
  const groupFilter = interaction.options.getString('group');
  const eraFilter = interaction.options.getString('era');
  const rarityFilter = interaction.options.getInteger('rarity');

  let query = supabase.from('cards').select('*');

  if (idolName) {
    query = query.ilike('name', `%${idolName}%`);
  }
  if (groupFilter) {
    query = query.ilike('group', `%${groupFilter}%`);
  }
  if (eraFilter) {
    query = query.ilike('era', `%${eraFilter}%`);
  }
  if (rarityFilter) {
    query = query.eq('rarity', rarityFilter);
  }

  const { data: cards, error } = await query.order('group', { ascending: true });

  if (error) {
    return interaction.editReply(`❌ Search error: ${error.message}`);
  }

  if (!cards || cards.length === 0) {
    return interaction.editReply('❌ No cards found matching your filters.');
  }

  const pageSize = 5;
  const pages = Math.ceil(cards.length / pageSize);
  let currentPage = 0;

  const generateEmbed = (page: number) => {
    const start = page * pageSize;
    const end = start + pageSize;
    const pageCards = cards.slice(start, end);

    const description = pageCards.map((c: any) => {
      const emoji = getRarityEmoji(c.rarity);
      const era = c.era ? ` • ${c.era}` : '';
      return `**${c.name}** (${c.group})${era}\n\`${c.cardcode}\` ${emoji}`;
    }).join('\n\n');

    return new EmbedBuilder()
      .setColor(0x8b4f9f)
      .setTitle(`🔍 Card Search Results (${cards.length} found)`)
      .setDescription(description)
      .setFooter({ text: `Page ${page + 1} of ${pages}` });
  };

  const buttons = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('search_prev')
        .setLabel('◀ Previous')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage === 0),
      new ButtonBuilder()
        .setCustomId('search_next')
        .setLabel('Next ▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage === pages - 1)
    );

  const response = await interaction.editReply({
    embeds: [generateEmbed(currentPage)],
    components: pages > 1 ? [buttons] : []
  });

  if (pages <= 1) return;

  const collector = response.createMessageComponentCollector({
    filter: i => i.user.id === interaction.user.id,
    time: 60000
  });

  collector.on('collect', async (i) => {
    if (i.customId === 'search_next') {
      currentPage = Math.min(currentPage + 1, pages - 1);
    } else if (i.customId === 'search_prev') {
      currentPage = Math.max(currentPage - 1, 0);
    }

    const newButtons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('search_prev')
          .setLabel('◀ Previous')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(currentPage === 0),
        new ButtonBuilder()
          .setCustomId('search_next')
          .setLabel('Next ▶')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(currentPage === pages - 1)
      );

    await i.update({
      embeds: [generateEmbed(currentPage)],
      components: [newButtons]
    });
  });

  collector.on('end', () => {
    const disabledButtons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('search_prev')
          .setLabel('◀ Previous')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId('search_next')
          .setLabel('Next ▶')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      );
    response.edit({ components: [disabledButtons] }).catch(() => {});
  });
}
