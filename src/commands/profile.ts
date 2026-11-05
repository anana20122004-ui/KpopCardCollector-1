import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { supabase } from '../database/supabase.js';
import { getTranslation } from '../utils/language.js';
import { getPastelProfileColor, isPastelHex } from '../utils/colors.js';

export const data = new SlashCommandBuilder()
  .setName('profile')
  .setDescription('View or edit your profile')
  .addSubcommand(s => s.setName('view').setDescription('View profile').addUserOption(o => o.setName('user').setDescription('User')))
  .addSubcommand(s => s.setName('bio').setDescription('Edit bio').addStringOption(o => o.setName('text').setDescription('Bio').setRequired(true).setMaxLength(200)))
  .addSubcommand(s => s.setName('color').setDescription('Set a pastel embed color').addStringOption(o => o.setName('hex').setDescription('Pastel hex, e.g. #F6C5D0').setRequired(true)))
  .addSubcommand(s => s.setName('favorite').setDescription('Set favorite card').addStringOption(o => o.setName('cardcode').setDescription('Card code (e.g., BP001)').setRequired(true)));

async function buildProfileEmbed(targetUser: any, dbUser: any, lang = 'en'): Promise<EmbedBuilder> {
  const colorHex = getPastelProfileColor(dbUser.profile_color);
  const color = parseInt(colorHex.slice(1), 16);
  const startDate = dbUser.created_at ? new Date(dbUser.created_at).toLocaleDateString() : 'N/A';

  const embed = new EmbedBuilder()
    .setColor(color)
    .setAuthor({ name: targetUser.username, iconURL: targetUser.displayAvatarURL() })
    .setDescription(dbUser.bio || '*No bio set*')
    .addFields(
      { name: '📅 Since', value: startDate, inline: true },
      { name: getTranslation(lang, 'coins_label'), value: `${dbUser.coins ?? 0}`, inline: true }
    );

  if (dbUser.favorite_card_id) {
    const { data: card } = await supabase
      .from('cards').select('*').eq('card_id', dbUser.favorite_card_id).maybeSingle();
    if (card) {
      embed.addFields({ name: '🎴 Favorite Card', value: `\`${card.cardcode}\` — **${card.name}** (${card.group})`, inline: false });
      if ((card as any).image_url) embed.setImage((card as any).image_url);
    }
  }

  return embed;
}

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const lang = (interaction as any).userLanguage || 'en';
  const sub = interaction.options.getSubcommand();
  const userId = interaction.user.id;

  if (sub === 'view') {
    const target = interaction.options.getUser('user') || interaction.user;
    const { data: user, error } = await supabase
      .from('users').select('*').eq('user_id', target.id).maybeSingle();

    if (error) console.error('[profile view] DB error:', error);
    if (!user) return interaction.editReply(getTranslation(lang, 'not_started'));

    const embed = await buildProfileEmbed(target, user, lang);
    return interaction.editReply({ embeds: [embed] });
  }

  if (sub === 'bio') {
    const text = interaction.options.getString('text', true);
    const { error } = await supabase.from('users').update({ bio: text }).eq('user_id', userId);
    if (error) {
      console.error('[profile bio] Update error:', error);
      return interaction.editReply({ content: `❌ ${getTranslation(lang, 'error_generic')}` });
    }

    const { data: updated } = await supabase.from('users').select('*').eq('user_id', userId).maybeSingle();
    if (!updated) return interaction.editReply(`✅ Bio updated!`);
    const embed = await buildProfileEmbed(interaction.user, updated, lang);
    embed.setFooter({ text: lang === 'es' ? '✅ ¡Biografía actualizada!' : '✅ Bio updated!' });
    return interaction.editReply({ embeds: [embed] });
  }

  if (sub === 'color') {
    const hex = interaction.options.getString('hex', true);
    if (!isPastelHex(hex)) {
      return interaction.editReply({ content: `❌ ${getTranslation(lang, 'profile_invalid_hex')}` });
    }
    const { error } = await supabase.from('users').update({ profile_color: hex }).eq('user_id', userId);
    if (error) {
      console.error('[profile color] Update error:', error);
      return interaction.editReply({ content: `❌ ${getTranslation(lang, 'error_generic')}` });
    }

    const { data: updated } = await supabase.from('users').select('*').eq('user_id', userId).maybeSingle();
    if (!updated) return interaction.editReply(`✅ Color updated to ${hex}!`);
    const embed = await buildProfileEmbed(interaction.user, updated, lang);
    embed.setFooter({ text: lang === 'es' ? `✅ Color actualizado a ${hex}` : `✅ Color updated to ${hex}` });
    return interaction.editReply({ embeds: [embed] });
  }

  if (sub === 'favorite') {
    const cardcode = interaction.options.getString('cardcode', true).toUpperCase();

    const { data: card } = await supabase.from('cards').select('*').eq('cardcode', cardcode).maybeSingle();
    if (!card) {
      return interaction.editReply({ content: `❌ Card \`${cardcode}\` not found!` });
    }

    const { data: owned } = await supabase
      .from('inventory').select('*').eq('user_id', userId).eq('card_id', (card as any).card_id).maybeSingle();
    if (!owned) {
      return interaction.editReply({
        content: lang === 'es'
          ? `❌ ¡No tienes \`${cardcode}\`! Consíguela con /drop o /shop.`
          : `❌ You don't own \`${cardcode}\`! Get it from /drop or /shop first.`
      });
    }

    const { error } = await supabase
      .from('users').update({ favorite_card_id: (card as any).card_id }).eq('user_id', userId);
    if (error) {
      console.error('[profile favorite] Update error:', error);
      return interaction.editReply({ content: `❌ ${getTranslation(lang, 'error_generic')}` });
    }

    const { data: updated } = await supabase.from('users').select('*').eq('user_id', userId).maybeSingle();
    if (!updated) return interaction.editReply(`✅ Favorite set to **${(card as any).name}**!`);
    const embed = await buildProfileEmbed(interaction.user, updated, lang);
    embed.setFooter({ text: lang === 'es' ? `✅ Carta favorita: ${(card as any).name}` : `✅ Favorite card set to ${(card as any).name}` });
    return interaction.editReply({ embeds: [embed] });
  }
}
