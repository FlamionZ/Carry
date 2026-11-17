import { isAppleMobile, isStandalone } from "../infrastructure/pwa/platform";
import { Notice } from "./Notice";

/**
 * On iPhone and iPad, Safari deletes a site's stored data after 7 days of
 * Safari use without visiting it, and a Home Screen web app keeps its own
 * storage, separate from Safari. CARRY's keys and communities live in that
 * storage, so iOS users should install first and use the installed app.
 */
export function IosStorageNotice() {
  if (!isAppleMobile() || isStandalone()) return null;
  return (
    <Notice tone="attention" title="On iPhone or iPad, add CARRY to the Home Screen first">
      Safari can delete a website's data after 7 days of Safari use without visiting it. The Home Screen app keeps
      its own data, separate from Safari. Tap Share, then Add to Home Screen, and create or join communities from
      the Home Screen app.
    </Notice>
  );
}
