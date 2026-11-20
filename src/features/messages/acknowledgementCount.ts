import type { MessageKind } from "../../domain/packet/schemas";

/**
 * The acknowledgement count on the author's device. Members confirm a
 * Request; other kinds are acknowledged. `count` is distinct members whose
 * acknowledgement was scanned on this device.
 */
export function acknowledgementCountText(kind: MessageKind, count: number): string {
  const verb = kind === "REQUEST" ? "confirmed" : "acknowledged";
  if (count === 0) return kind === "REQUEST" ? "No members confirmed yet" : "No acknowledgements yet";
  return `${count} ${count === 1 ? "member" : "members"} ${verb}`;
}
