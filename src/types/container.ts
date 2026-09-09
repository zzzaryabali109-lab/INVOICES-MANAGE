export interface ContainerData {
  containerNumber: string;
  shippingLine: string;
  currentLocation: string;
  vesselName: string;
  voyageNumber: string;
  eta: string;
  lastUpdate: string;
  status: ContainerStatus;
  destinationPort?: string;
  isTracking?: boolean;
  error?: string;
}

export type ContainerStatus = 
  | 'In Transit'
  | 'Arrived'
  | 'Discharged'
  | 'Loading'
  | 'Pending'
  | 'Not Available';

export interface TrackingResult {
  success: boolean;
  data?: ContainerData;
  error?: string;
}

export interface UploadResponse {
  success: boolean;
  containerNumbers: string[];
  error?: string;
}
