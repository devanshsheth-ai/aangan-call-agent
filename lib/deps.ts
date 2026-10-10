import { classifyCall } from "./classify";
import { sendEmail } from "./email";
import { env, numberEnv, optionalEnv } from "./env";
import { createDeal } from "./hubspot";
import { actionUrl } from "./links";
import type { Deps } from "./pipeline";
import { dbStore } from "./store";

export function liveDeps(): Deps {
  return {
    store: dbStore,
    classify: classifyCall,
    sendEmail,
    createDeal: optionalEnv("HUBSPOT_PRIVATE_APP_TOKEN") ? createDeal : undefined,
    actionUrl,
    get frontDeskEmail() {
      return env("FRONT_DESK_EMAIL");
    },
    bookingUrl: optionalEnv("CALCOM_BOOKING_URL"),
    voiceRateInrPerMin: numberEnv("VAANI_RATE_INR_PER_MIN", 0),
  };
}
