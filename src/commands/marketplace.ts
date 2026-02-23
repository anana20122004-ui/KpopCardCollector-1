import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { supabase } from '../database/supabase.js';
import { getRarityEmoji } from '../utils/cards.js';
import { getTranslation } from '../utils/language.js';

export const data = new SlashCommandBuilder()
  .setName('mp')
  .setDescription('Browse the marketplace')
  .addSubcommand(subcommand =>
    subcommand
      .setName('list')
      .setDescription('List a card for sale')
      .addStringOption(option =>
        option.setName('cardcode')
          .setDescription('Card code (e.g., BP001)')
          .setRequired(true))
      .addIntegerOption(option =>
        option.setName('price')
          .setDescription('Price in coins')
          .setRequired(true)
          .setMinValue(1))
      .addIntegerOption(option =>
        option.setName('quantity')
          .setDescription('Quantity to sell')
          .setMinValue(1)
          .setRequired(false)))
  .addSubcommand(subcommand =>
    subcommand
      .setName('browse')
      .setDescription('Browse available cards'))
  .addSubcommand(subcommand =>
    subcommand
      .setName('buy')
      .setDescription('Buy a card from the marketplace')
      .addStringOption(option =>
        option.setName('code')
          .setDescription('The listing code to purchase (e.g., 691.BCA)')
          .setRequired(true)));

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const lang = (interaction as any).userLanguage || 'en';
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'list') {
    await handleList(interaction, lang);
  } else if (subcommand === 'browse') {
    await handleBrowse(interaction, lang);
  } else if (subcommand === 'buy') {
    await handleBuy(interaction, lang);
  }
}

function generateListingCode(): string {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 3; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  code += '.';
  for (let i = 0; i < 3; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
}

async function handleList(interaction: ChatInputCommandInteraction, lang: string) {
  const userId = interaction.user.id;
  const cardcode = interaction.options.getString('cardcode', true).toUpperCase();
  const price = interaction.options.getInteger('price', true);
  const quantity = interaction.options.getInteger('quantity') || 1;

  const { data: card } = await supabase.from('cards').select('*').eq('cardcode', cardcode).maybeSingle();

  if (!card) {
    await interaction.editReply({ content: getTranslation(lang, 'not_enough_cards') });
    return;
  }

  const listingCodes: string[] = [];
  let hasError = false;

  for (let i = 0; i < quantity; i++) {
    const listingCode = generateListingCode();
    const { data, error } = await supabase.rpc('list_card_on_marketplace', {
      p_user_id: userId,
      p_card_id: card.card_id,
      p_price: price,
      p_quantity: 1,
      p_code: listingCode
    });

    if (error || !data) {
      hasError = true;
      break;
    }

    const result = data as any;
    if (!result.success) {
      if (result.error === 'insufficient_cards') {
        await interaction.editReply({ content: getTranslation(lang, 'error_insufficient_cards', { qty: result.available }) });
        return;
      }
      hasError = true;
      break;
    }
    listingCodes.push(listingCode);
  }

  if (hasError) {
    await interaction.editReply({ content: getTranslation(lang, 'error_generic') });
    return;
  }

  const codesDisplay = listingCodes.map(code => `\`${code}\``).join(', ');
  const embed = new EmbedBuilder()
    .setColor(0xff69b4)
    .setTitle(getTranslation(lang, 'marketplace_list_success'))
    .setDescription(getTranslation(lang, 'marketplace_list_desc'))
    .addFields(
      { name: getTranslation(lang, 'marketplace_list_codes'), value: codesDisplay },
      { name: getTranslation(lang, 'marketplace_list_price'), value: `${price} ${lang === 'es' ? 'monedas' : 'coins'}` },
      { name: getTranslation(lang, 'marketplace_list_qty'), value: `${quantity}` }
    );

  await interaction.editReply({ embeds: [embed] });
}

async function handleBrowse(interaction: ChatInputCommandInteraction, lang: string) {
  const { data: listings } = await supabase.from('marketplace').select(`
    code,
    price,
    quantity,
    seller_id,
    cards (
      card_id,
      name,
      group,
      era,
      rarity,
      cardcode
    )
  `).limit(10);

  if (!listings || listings.length === 0) {
    await interaction.editReply({ content: getTranslation(lang, 'marketplace_empty') });
    return;
  }

  const listingText = (await Promise.all(listings.map(async (listing: any) => {
    const card = listing.cards;
    const eraText = card.era ? ` - ${card.era}` : '';
    let sellerName = listing.seller_id;
    try {
      const seller = await interaction.client.users.fetch(listing.seller_id);
      sellerName = seller.username;
    } catch (e) {}
    const sellerHint = lang === 'es' ? `de @${sellerName}` : `from @${sellerName}`;
    return `**\`${listing.code}\`** | ${getRarityEmoji(card.rarity)} ${card.name} (${card.group}${eraText}) • \`${card.cardcode}\` | ${listing.price} ${lang === 'es' ? 'monedas' : 'coins'} | x${listing.quantity} | *${sellerHint}*`;
  }))).join('\n');

  const embed = new EmbedBuilder()
    .setColor(0xff69b4)
    .setTitle(getTranslation(lang, 'marketplace_title'))
    .setDescription(listingText)
    .setFooter({ text: lang === 'es' ? 'Usa /mp buy <code> para comprar' : 'Use /mp buy <code> to purchase' });

  await interaction.editReply({ embeds: [embed] });
}

async function handleBuy(interaction: ChatInputCommandInteraction, lang: string) {
  const userId = interaction.user.id;
  const code = interaction.options.getString('code', true).toUpperCase();

  const { data: listing } = await supabase.from('marketplace').select(`
    listing_id,
    code,
    *,
    cards (
      card_id,
      name,
      group,
      era,
      rarity
    )
  `).eq('code', code).maybeSingle();

  if (!listing) {
    await interaction.editReply({ content: getTranslation(lang, 'error_generic') });
    return;
  }

  const { data, error } = await supabase.rpc('purchase_marketplace_listing', {
    p_buyer_id: userId,
    p_listing_id: (listing as any).listing_id
  });

  if (error || !data) {
    await interaction.editReply({ content: getTranslation(lang, 'error_generic') });
    return;
  }

  const result = data as any;
  if (!result.success) {
    if (result.error === 'listing_not_found') return interaction.editReply({ content: lang === 'es' ? '🧚 ¡Listado no encontrado o ya vendido!' : '🧚 Listing not found or already sold!' });
    if (result.error === 'cannot_buy_own_listing') return interaction.editReply({ content: lang === 'es' ? '🧚 ¡No puedes comprar tu propio listado!' : '🧚 You cannot buy your own listing!' });
    if (result.error === 'buyer_not_found') return interaction.editReply({ content: getTranslation(lang, 'start_prompt') });
    if (result.error === 'insufficient_funds') return interaction.editReply({ content: lang === 'es' ? `🧚 ¡Necesitas ${result.required} monedas! Tienes ${result.available} monedas.` : `🧚 You need ${result.required} coins! You have ${result.available} coins.` });
    return interaction.editReply({ content: getTranslation(lang, 'error_generic') });
  }

  const card = (listing as any).cards;
  const eraText = card.era ? ` - ${card.era}` : '';
  const embed = new EmbedBuilder()
    .setColor(0xff69b4)
    .setTitle(getTranslation(lang, 'marketplace_buy_title'))
    .setDescription(getTranslation(lang, 'marketplace_buy_desc', { card: card.name }))
    .addFields(
      { name: getTranslation(lang, 'marketplace_buy_field_card'), value: `${getRarityEmoji(card.rarity)} ${card.name} (${card.group}${eraText})` },
      { name: getTranslation(lang, 'marketplace_buy_field_price'), value: `${result.price} ${lang === 'es' ? 'monedas' : 'coins'}` },
      { name: getTranslation(lang, 'marketplace_buy_field_balance'), value: `${result.new_balance} ${lang === 'es' ? 'monedas' : 'coins'}` }
    );

  await interaction.editReply({ embeds: [embed] });

  try {
    const seller = await interaction.client.users.fetch((listing as any).seller_id);
    const sellerEmbed = new EmbedBuilder()
      .setColor(0xff69b4)
      .setTitle(getTranslation(lang, 'marketplace_sold_title'))
      .setDescription(getTranslation(lang, 'marketplace_sold_desc'))
      .addFields(
        { name: getTranslation(lang, 'marketplace_buy_field_card'), value: `${getRarityEmoji(card.rarity)} ${card.name} (${card.group}${eraText})` },
        { name: getTranslation(lang, 'marketplace_sold_field_qty'), value: `x${result.quantity}` },
        { name: getTranslation(lang, 'marketplace_sold_field_buyer'), value: `@${interaction.user.username}` },
        { name: getTranslation(lang, 'marketplace_buy_field_price'), value: `${result.price} ${lang === 'es' ? 'monedas' : 'coins'}` }
      );
    await seller.send({ embeds: [sellerEmbed] });
  } catch (e) {}
}
