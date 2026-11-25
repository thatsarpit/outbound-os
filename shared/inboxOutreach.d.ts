export const OUTREACH_CHANNELS: string[];
export const ACCEPTED_OUTREACH_STATUSES: string[];
export const OUTREACH_DELIVERY_EXCEPTIONS: string[];

export function hasConfirmedOutreach(message: {
  direction: string;
  status: string;
  providerDeliveryStatus?: string | null;
}): boolean;
