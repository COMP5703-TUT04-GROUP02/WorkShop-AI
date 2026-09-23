import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * WS-99. A provider picks a place on the register form, but there is nowhere
 * to put it yet: /register does not take a location and the provider profile
 * is created later. The place waits on this device until the profile form
 * sends it as address / latitude / longitude, and is dropped straight after.
 *
 * Keyed by user id, so two accounts on one device never inherit each other's
 * address.
 */
export type PendingProviderPlace = {
  address: string;
  latitude: number;
  longitude: number;
};

function storageKey(userId: number) {
  return `workshop.pendingProviderPlace.${userId}`;
}

export async function savePendingProviderPlace(
  userId: number,
  place: PendingProviderPlace,
) {
  await AsyncStorage.setItem(storageKey(userId), JSON.stringify(place));
}

export async function readPendingProviderPlace(userId: number) {
  const stored = await AsyncStorage.getItem(storageKey(userId));

  if (!stored) {
    return null;
  }

  try {
    const place = JSON.parse(stored) as Partial<PendingProviderPlace>;

    // A half-written or hand-edited value is worse than none: the profile
    // would be created on coordinates nobody chose.
    if (
      typeof place.address !== "string" ||
      !place.address ||
      typeof place.latitude !== "number" ||
      typeof place.longitude !== "number"
    ) {
      return null;
    }

    return place as PendingProviderPlace;
  } catch {
    return null;
  }
}

export async function clearPendingProviderPlace(userId: number) {
  await AsyncStorage.removeItem(storageKey(userId));
}
