import { supabase } from '@/integrations/supabase/client';
import { ContainerData } from '@/types/container';

export interface DbContainer {
  id: string;
  user_id: string;
  container_number: string;
  shipping_line: string | null;
  current_location: string | null;
  vessel_name: string | null;
  voyage_number: string | null;
  eta: string | null;
  last_update: string | null;
  status: string;
  origin_port: string | null;
  destination_port: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

// Convert database container to app format
export const dbToContainerData = (db: DbContainer): ContainerData => ({
  containerNumber: db.container_number,
  shippingLine: db.shipping_line || '',
  currentLocation: db.current_location || '',
  vesselName: db.vessel_name || '',
  voyageNumber: db.voyage_number || '',
  eta: db.eta || '',
  lastUpdate: db.last_update || '',
  status: (db.status as ContainerData['status']) || 'Pending',
  destinationPort: db.destination_port || undefined,
  error: db.error || undefined,
});

// Convert app container to database format (for insert/update)
export const containerDataToDb = (container: ContainerData, userId: string) => ({
  user_id: userId,
  container_number: container.containerNumber,
  shipping_line: container.shippingLine || null,
  current_location: container.currentLocation || null,
  vessel_name: container.vesselName || null,
  voyage_number: container.voyageNumber || null,
  eta: container.eta || null,
  last_update: container.lastUpdate || null,
  status: container.status,
  origin_port: null,
  destination_port: container.destinationPort || null,
  error: container.error || null,
});

const LOCAL_STORAGE_KEY = 'tracked_containers_cache';

function getLocalContainers(): ContainerData[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalContainers(items: ContainerData[]) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
}

// Fetch all containers for the current user
export const fetchUserContainers = async (): Promise<ContainerData[]> => {
  try {
    const { data, error } = await supabase
      .from('tracked_containers')
      .select('*')
      .order('created_at', { ascending: false });

    if (error || !data) {
      console.warn('Database query error, using local fallback:', error);
      return getLocalContainers();
    }

    const containers = (data as DbContainer[]).map(dbToContainerData);
    saveLocalContainers(containers);
    return containers;
  } catch (err) {
    console.warn('Failed to fetch from DB, using local fallback:', err);
    return getLocalContainers();
  }
};

// Upsert a container (insert or update)
export const upsertContainer = async (container: ContainerData, userId: string): Promise<void> => {
  const current = getLocalContainers();
  const index = current.findIndex(c => c.containerNumber === container.containerNumber);
  if (index >= 0) {
    current[index] = container;
  } else {
    current.unshift(container);
  }
  saveLocalContainers(current);

  try {
    const dbData = containerDataToDb(container, userId);
    const { error } = await supabase
      .from('tracked_containers')
      .upsert(dbData, { 
        onConflict: 'user_id,container_number',
        ignoreDuplicates: false 
      });

    if (error) {
      console.warn('Remote db upsert failed, stored locally:', error);
    }
  } catch (err) {
    console.warn('Remote db error during upsert, stored locally:', err);
  }
};

// Upsert multiple containers
export const upsertContainers = async (containers: ContainerData[], userId: string): Promise<void> => {
  const current = getLocalContainers();
  containers.forEach(container => {
    const index = current.findIndex(c => c.containerNumber === container.containerNumber);
    if (index >= 0) {
      current[index] = container;
    } else {
      current.unshift(container);
    }
  });
  saveLocalContainers(current);

  try {
    const dbData = containers.map(c => containerDataToDb(c, userId));
    const { error } = await supabase
      .from('tracked_containers')
      .upsert(dbData, { 
        onConflict: 'user_id,container_number',
        ignoreDuplicates: false 
      });

    if (error) {
      console.warn('Remote db batch upsert failed, stored locally:', error);
    }
  } catch (err) {
    console.warn('Remote db error during batch upsert, stored locally:', err);
  }
};

// Delete a container (with user ownership verification)
export const deleteContainer = async (containerNumber: string): Promise<void> => {
  const current = getLocalContainers().filter(c => c.containerNumber !== containerNumber);
  saveLocalContainers(current);

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from('tracked_containers')
      .delete()
      .eq('user_id', user.id)
      .eq('container_number', containerNumber);
  } catch (err) {
    console.warn('Remote db delete failed, deleted locally:', err);
  }
};

// Delete multiple containers by container numbers
export const deleteContainers = async (containerNumbers: string[]): Promise<void> => {
  if (containerNumbers.length === 0) return;
  const set = new Set(containerNumbers);
  const current = getLocalContainers().filter(c => !set.has(c.containerNumber));
  saveLocalContainers(current);

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from('tracked_containers')
      .delete()
      .eq('user_id', user.id)
      .in('container_number', containerNumbers);
  } catch (err) {
    console.warn('Remote db batch delete failed, deleted locally:', err);
  }
};

// Delete all containers for current user
export const deleteAllContainers = async (): Promise<void> => {
  saveLocalContainers([]);

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from('tracked_containers')
      .delete()
      .eq('user_id', user.id);
  } catch (err) {
    console.warn('Remote db delete all failed, deleted locally:', err);
  }
};
