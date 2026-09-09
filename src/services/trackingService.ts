import { supabase } from '@/integrations/supabase/client';
import { ContainerData, TrackingResult } from '@/types/container';

export async function trackContainer(containerNumber: string): Promise<TrackingResult> {
  const cleanNumber = (containerNumber || '').trim().toUpperCase();
  if (!cleanNumber) {
    return {
      success: false,
      error: 'Container number is required',
    };
  }

  // 1. Try our backend API route (/api/track-container) which queries the Traqo API
  try {
    const response = await fetch('/api/track-container', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ containerNumber: cleanNumber })
    });

    if (response.ok) {
      const result = await response.json();
      if (result && typeof result === 'object' && result.success) {
        return result as TrackingResult;
      }
      if (result && result.error && result.data) {
        return result as TrackingResult;
      }
    }
  } catch (backendErr) {
    console.warn('Backend /api/track-container error, trying fallback:', backendErr);
  }

  // 2. Fallback to Supabase function
  try {
    const { data, error } = await supabase.functions.invoke('track-container', {
      body: { containerNumber: cleanNumber }
    });

    if (error) {
      console.error('Edge function error:', error);
      return {
        success: false,
        error: error.message || 'Failed to track container',
        data: {
          containerNumber: cleanNumber,
          shippingLine: '',
          currentLocation: '',
          vesselName: '',
          voyageNumber: '',
          eta: '',
          lastUpdate: '',
          status: 'Not Available',
          error: 'Tracking failed'
        }
      };
    }

    return data as TrackingResult;
  } catch (err) {
    console.error('Tracking error:', err);
    return {
      success: false,
      error: 'Network error',
      data: {
        containerNumber: cleanNumber,
        shippingLine: '',
        currentLocation: '',
        vesselName: '',
        voyageNumber: '',
        eta: '',
        lastUpdate: '',
        status: 'Not Available',
        error: 'Network error'
      }
    };
  }
}

export async function trackContainers(
  containerNumbers: string[],
  onProgress: (completed: number, data: ContainerData) => void
): Promise<ContainerData[]> {
  const results: ContainerData[] = [];
  
  // Process containers sequentially with delay to avoid API rate limits
  // The TimeToCargo API has rate limiting, so we need to be careful
  const batchSize = 2; // Reduced batch size for better reliability
  const delayBetweenBatches = 1500; // 1.5 seconds between batches
  const delayBetweenRequests = 500; // 0.5 seconds between individual requests
  
  for (let i = 0; i < containerNumbers.length; i += batchSize) {
    const batch = containerNumbers.slice(i, i + batchSize);
    
    // Process each container in the batch sequentially with small delays
    for (let j = 0; j < batch.length; j++) {
      const containerNumber = batch[j];
      const overallIndex = i + j;
      
      try {
        // Add delay between requests (except for the first one)
        if (overallIndex > 0) {
          await new Promise(resolve => setTimeout(resolve, delayBetweenRequests));
        }
        
        const result = await trackContainer(containerNumber);
        const containerData = result.data || {
          containerNumber,
          shippingLine: '',
          currentLocation: '',
          vesselName: '',
          voyageNumber: '',
          eta: '',
          lastUpdate: '',
          status: 'Not Available' as const,
          error: result.error
        };
        
        onProgress(overallIndex + 1, containerData);
        results.push(containerData);
      } catch (error) {
        console.error(`Error tracking ${containerNumber}:`, error);
        const errorData: ContainerData = {
          containerNumber,
          shippingLine: '',
          currentLocation: '',
          vesselName: '',
          voyageNumber: '',
          eta: '',
          lastUpdate: '',
          status: 'Not Available',
          error: 'Tracking failed - please retry'
        };
        onProgress(overallIndex + 1, errorData);
        results.push(errorData);
      }
    }
    
    // Add longer delay between batches to avoid rate limiting
    if (i + batchSize < containerNumbers.length) {
      await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
    }
  }
  
  return results;
}
