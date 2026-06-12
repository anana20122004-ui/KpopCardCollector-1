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

  // Resolve card
  const { data: card, error: cardErr } = await supabase
    .from('cards').select('*').eq('cardcode', cardcode).maybeSingle();

  if (cardErr || !card) {
    return interaction.editReply({ content: getTranslation(lang, 'not_enough_cards') });
  }

  // Check ownership
  const { data: inv, error: invErr } = await supabase
    .from('inventory').select('*')
    .eq('user_id', userId).eq('card_id', card.card_id).maybeSingle();

  if (invErr || !inv || (inv as any).quantity < quantity) {
    return interaction.editReply({
      content: getTranslation(lang, 'error_insufficient_cards', { qty: (inv as any)?.quantity ?? 0 })
    });
  }

  // Deduct from inventory
  const newQty = (inv as any).quantity - quantity;
  if (newQty === 0) {
    const { error: delErr } = await supabase.from('inventory').delete().eq('id', (inv as any).id);
    if (delErr) return interaction.editReply({ content: getTranslation(lang, 'error_generic') });
  } else {
    const { error: updErr } = await supabase
      .from('inventory').update({ quantity: newQty }).eq('id', (inv as any).id);
    if (updErr) return interaction.editReply({ content: getTranslation(lang, 'error_generic') });
  }

  // Create listings
  const listingCodes: string[] = [];
  for (let i = 0; i < quantity; i++) {
    const code = generateListingCode();
    const { error: insErr } = await supabase.from('marketplace').insert({
      seller_id: userId,
      card_id: card.card_id,
      price,
      quantity: 1,
      code,
    });
    if (insErr) {
      // Restore inventory on failure
      await supabase.from('inventory').upsert({ user_id: userId, card_id: card.card_id, quantity: quantity - i });
      return interaction.editReply({ content: getTranslation(lang, 'error_generic') });
    }
    listingCodes.push(code);
  }

  const codesDisplay = listingCodes.map(c => `\`${c}\``).join(', ');
  const embed = new EmbedBuilder()
    .setColor(0xFFB6E1)
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
  const { data: listings, error } = await supabase.from('marketplace').select(`
    code, price, quantity, seller_id,
    cards ( card_id, name, group, era, rarity, cardcode )
  `).limit(10);

  if (error || !listings || listings.length === 0) {
    return interaction.editReply({ content: getTranslation(lang, 'marketplace_empty') });
  }

  const listingText = (await Promise.all(listings.map(async (listing: any) => {
    const card = listing.cards;
    const eraText = card.era ? ` - ${card.era}` : '';
    let sellerName = listing.seller_id;
    try {
      const seller = await interaction.client.users.fetch(listing.seller_id);
      sellerName = seller.username;
    } catch (_) {}
    const sellerHint = lang === 'es' ? `de @${sellerName}` : `from @${sellerName}`;
    return `**\`${listing.code}\`** | ${getRarityEmoji(card.rarity)} ${card.name} (${card.group}${eraText}) • \`${card.cardcode}\` | ${listing.price} ${lang === 'es' ? 'monedas' : 'coins'} | x${listing.quantity} | *${sellerHint}*`;
  }))).join('\n');

  const embed = new EmbedBuilder()
    .setColor(0xFFB6E1)
    .setTitle(getTranslation(lang, 'marketplace_title'))
    .setDescription(listingText)
    .setFooter({ text: lang === 'es' ? 'Usa /mp buy <code> para comprar' : 'Use /mp buy <code> to purchase' });

  await interaction.editReply({ embeds: [embed] });
}

async function handleBuy(interaction: ChatInputCommandInteraction, lang: string) {
  const userId = interaction.user.id;
  const code = interaction.options.getString('code', true).toUpperCase();

  // Fetch listing with card info
  const { data: listing, error: listErr } = await supabase.from('marketplace').select(`
    listing_id, code, seller_id, price, quantity,
    cards ( card_id, name, group, era, rarity )
  `).eq('code', code).maybeSingle();

  if (listErr || !listing) {
    return interaction.editReply({ content: lang === 'es' ? '🧚 ¡Listado no encontrado o ya vendido!' : '🧚 Listing not found or already sold!' });
  }

  if ((listing as any).seller_id === userId) {
    return interaction.editReply({ content: lang === 'es' ? '🧚 ¡No puedes comprar tu propio listado!' : '🧚 You cannot buy your own listing!' });
  }

  // Fetch buyer
  const { data: buyer, error: buyerErr } = await supabase
    .from('users').select('*').eq('user_id', userId).maybeSingle();

  if (buyerErr || !buyer) {
    return interaction.editReply({ content: getTranslation(lang, 'start_prompt') });
  }

  const price = (listing as any).price;
  if ((buyer as any).coins < price) {
    return interaction.editReply({
      content: lang === 'es'
        ? `🧚 ¡Necesitas ${price} monedas! Tienes ${(buyer as any).coins} monedas.`
        : `🧚 You need ${price} coins! You have ${(buyer as any).coins} coins.`
    });
  }

  const card = (listing as any).cards;
  const qty = (listing as any).quantity;
  const sellerId = (listing as any).seller_id;
  const listingId = (listing as any).listing_id;

  // Deduct buyer coins
  const { error: deductErr } = await supabase
    .from('users').update({ coins: (buyer as any).coins - price }).eq('user_id', userId);
  if (deductErr) return interaction.editReply({ content: getTranslation(lang, 'error_generic') });

  // Credit seller coins
  const { data: sellerData } = await supabase
    .from('users').select('coins').eq('user_id', sellerId).maybeSingle();
  if (sellerData) {
    await supabase.from('users')
      .update({ coins: (sellerData as any).coins + price })
      .eq('user_id', sellerId);
  }

  // Add card to buyer inventory
  const { data: existingInv } = await supabase
    .from('inventory').select('*').eq('user_id', userId).eq('card_id', card.card_id).maybeSingle();

  if (existingInv) {
    await supabase.from('inventory')
      .update({ quantity: (existingInv as any).quantity + qty })
      .eq('id', (existingInv as any).id);
  } else {
    await supabase.from('inventory').insert({ user_id: userId, card_id: card.card_id, quantity: qty });
  }

  // Delete listing
  await supabase.from('marketplace').delete().eq('listing_id', listingId);

  const newBalance = (buyer as any).coins - price;
  const eraText = card.era ? ` - ${card.era}` : '';

  const embed = new EmbedBuilder()
    .setColor(0xFFB6E1)
    .setTitle(getTranslation(lang, 'marketplace_buy_title'))
    .setDescription(getTranslation(lang, 'marketplace_buy_desc', { card: card.name }))
    .addFields(
      { name: getTranslation(lang, 'marketplace_buy_field_card'), value: `${getRarityEmoji(card.rarity)} ${card.name} (${card.group}${eraText})` },
      { name: getTranslation(lang, 'marketplace_buy_field_price'), value: `${price} ${lang === 'es' ? 'monedas' : 'coins'}` },
      { name: getTranslation(lang, 'marketplace_buy_field_balance'), value: `${newBalance} ${lang === 'es' ? 'monedas' : 'coins'}` }
    );

  await interaction.editReply({ embeds: [embed] });

  // DM seller
  try {
    const seller = await interaction.client.users.fetch(sellerId);
    const sellerEmbed = new EmbedBuilder()
      .setColor(0xFFB6E1)
      .setTitle(getTranslation(lang, 'marketplace_sold_title'))
      .setDescription(getTranslation(lang, 'marketplace_sold_desc'))
      .addFields(
        { name: getTranslation(lang, 'marketplace_buy_field_card'), value: `${getRarityEmoji(card.rarity)} ${card.name} (${card.group}${eraText})` },
        { name: getTranslation(lang, 'marketplace_sold_field_qty'), value: `x${qty}` },
        { name: getTranslation(lang, 'marketplace_sold_field_buyer'), value: `@${interaction.user.username}` },
        { name: getTranslation(lang, 'marketplace_buy_field_price'), value: `${price} ${lang === 'es' ? 'monedas' : 'coins'}` }
      );
    await seller.send({ embeds: [sellerEmbed] });
  } catch (_) {}
}
