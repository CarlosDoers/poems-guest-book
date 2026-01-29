import { getSupabase, isSupabaseConfigured } from './supabase';

let channel = null;

export function getSyncChannel() {
  if (!channel && isSupabaseConfigured()) {
    const supabase = getSupabase();
    channel = supabase.channel('guestbook_sync');
    
    // Auto-subscribe
    channel.subscribe((status) => {
      console.log(`[SYNC] Channel status: ${status}`);
      if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
        channel = null; // Force recreation on next call if error
      }
    });
  }
  return channel;
}

export function sendSyncEvent(event, data = {}) {
  const syncChannel = getSyncChannel();
  if (syncChannel) {
    console.log(`[SYNC] Sending event: ${event}`, data);
    return syncChannel.send({
      type: 'broadcast',
      event: event,
      payload: { data }
    });
  }
  return null;
}
