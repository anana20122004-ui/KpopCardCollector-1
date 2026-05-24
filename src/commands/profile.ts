import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { supabase } from '../database/supabase.js';
import { getTranslation } from '../utils/language.js';

export const data = new SlashCommandBuilder()
  .setName('profile')
  .setDescription('View or edit your profile')
  .addSubcommand(s => s.setName('view').setDescription('View profile').addUserOption(o => o.setName('user').setDescription('User')))
  .addSubcommand(s => s.setName('bio').setDescription('Edit bio').addStringOption(o => o.setName('text').setDescription('Bio').setRequired(true).setMaxLength(200)))
  .addSubcommand(s => s.setName('color').setDescription('Edit color').addStringOption(o => o.setName('hex').setDescription('#hex').setRequired(true)))
  .addSubcommand(s => s.setName('favorite').setDescription('Set favorite card').addStringOption(o => o.setName('cardcode').setDescription('Card code (e.g., BP001)').setRequired(true)));

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const lang = (interaction as any).userLanguage || 'en';
  const sub = interaction.options.getSubcommand();
  const userId = interaction.user.id;

  if (sub === 'view') {
    const target = interaction.options.getUser('user') || interaction.user;
    const { data: user } = await supabase.from('users').select('*').eq('user_id', target.id).single();
    if (!user) return interaction.editReply(getTranslation(lang, 'not_started'));
    
    const startDate = user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A';
    
    // Get favorite card info if set
    let favoriteCardInfo = '';
    let favoriteCard = null;
    if ((user as any).favorite_card_id) {
      const { data: card } = await supabase.from('cards').select('*').eq('card_id', (user as any).favorite_card_id).single();
      if (card) {
        favoriteCard = card;
        favoriteCardInfo = `\`${card.cardcode}\` - **${card.name}** (${card.group})`;
      }
    }
    
    const embed = new EmbedBuilder()
      .setColor(parseInt((user as any).profile_color?.replace('#', '') || 'ff69b4', 16))
      .setTitle(`${target.username}'s Profile`)
      .setDescription((user as any).bio || 'No bio set yet')
      .addFields(
        { name: '**Username:**', value: target.username, inline: false },
        { name: '**Start date:**', value: startDate, inline: false },
        { name: '**Balance:**', value: `💫 ${(user as any).coins}`, inline: false }
      );
    
    if (favoriteCardInfo && favoriteCard) {
      embed.addFields({ name: '**Favorite Card:**', value: favoriteCardInfo, inline: false });
      embed.setImage((favoriteCard as any).image_url);
    }
    
    return interaction.editReply({ embeds: [embed] });
  }

  if (sub === 'bio') {
    const text = interaction.options.getString('text', true);
    await supabase.from('users').update({ bio: text }).eq('user_id', userId);
    return interaction.editReply(`✅ Bio updated to: "${text}"`);
  }

  if (sub === 'color') {
    const hex = interaction.options.getString('hex', true);
    if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return interaction.editReply('❌ Invalid hex color! Use format: #RRGGBB');
    await supabase.from('users').update({ profile_color: hex }).eq('user_id', userId);
    return interaction.editReply(`✅ Profile color updated to ${hex}`);
  }

  if (sub === 'favorite') {
    const cardcode = interaction.options.getString('cardcode', true).toUpperCase();
    
    // Check if card exists
    const { data: card } = await supabase.from('cards').select('*').eq('cardcode', cardcode).maybeSingle();
    if (!card) return interaction.editReply(`❌ Card \`${cardcode}\` not found!`);
    
    // Check if user owns this card
    const { data: owned } = await supabase.from('inventory').select('*').eq('user_id', userId).eq('card_id', (card as any).card_id).maybeSingle();
    if (!owned) return interaction.editReply(`❌ You don't own \`${cardcode}\`! Get it from /drop or /shop first.`);
    
    // Set as favorite
    await supabase.from('users').update({ favorite_card_id: (card as any).card_id }).eq('user_id', userId);
    return interaction.editReply(`✅ Favorite card set to **${(card as any).name}** (${(card as any).group})!`);
  }
}
