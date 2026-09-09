import { supabase } from '@/integrations/supabase/client';
import { ContainerData } from '@/types/container';

export async function sendStatusNotification(
  email: string,
  containerNumber: string,
  oldStatus: string,
  newStatus: string,
  vesselName?: string,
  eta?: string,
  destinationPort?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('send-status-notification', {
      body: {
        email,
        containerNumber,
        oldStatus,
        newStatus,
        vesselName,
        eta,
        destinationPort,
      },
    });

    if (error) {
      console.error('Notification error:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Failed to send notification:', error);
    return { success: false, error: error.message };
  }
}

export function detectStatusChanges(
  oldData: ContainerData[],
  newData: ContainerData[]
): Array<{ container: ContainerData; oldStatus: string }> {
  const changes: Array<{ container: ContainerData; oldStatus: string }> = [];
  
  const oldMap = new Map(oldData.map(c => [c.containerNumber, c.status]));
  
  for (const container of newData) {
    const oldStatus = oldMap.get(container.containerNumber);
    if (oldStatus && oldStatus !== container.status && container.status !== 'Pending') {
      changes.push({ container, oldStatus });
    }
  }
  
  return changes;
}
