
import { Client, TextChannel, EmbedBuilder } from 'discord.js';
import { supabase } from '../database/supabase.js';

interface Reminder {
  userId: string;
  channelId: string;
  commandName: string;
  expiresAt: number;
}

const activeReminders = new Map<string, NodeJS.Timeout>();

export async function scheduleReminder(
  client: Client,
  userId: string,
  channelId: string,
  commandName: string,
  cooldownMs: number
) {
  // Check user settings
  const { data: user } = await supabase
    .from('users')
    .select('reminder_settings')
    .eq('user_id', userId)
    .single();

  if (user) {
    const settings = user.reminder_settings || {};
    if (settings[commandName] === false) return; // Disabled for this specific command
  }

  const reminderId = `${userId}-${commandName}`;
  
  // Cancel existing reminder if any
  if (activeReminders.has(reminderId)) {
    clearTimeout(activeReminders.get(reminderId)!);
  }

  // Schedule new reminder
  const timeout = setTimeout(async () => {
    try {
      const channel = await client.channels.fetch(channelId) as TextChannel;
      if (!channel) return;

      const embed = new EmbedBuilder()
        .setColor(0xCDECCB)
        .setTitle('⏰ Cooldown Ready!')
        .setDescription(`Your **/${commandName}** command is ready to use again!`)
        .setTimestamp();

      await channel.send({ content: `<@${userId}>`, embeds: [embed] });
      activeReminders.delete(reminderId);
    } catch (error) {
      console.error('Error sending reminder:', error);
    }
  }, cooldownMs);

  activeReminders.set(reminderId, timeout);
}

export function cancelReminder(userId: string, commandName: string) {
  const reminderId = `${userId}-${commandName}`;
  if (activeReminders.has(reminderId)) {
    clearTimeout(activeReminders.get(reminderId)!);
    activeReminders.delete(reminderId);
  }
}
