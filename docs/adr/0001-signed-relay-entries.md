---
Status: accepted
---

# Relays sign a relay entry into the packet

To show a relay journey that can be verified rather than drawn, each relay appends a signed relay entry to the packet's mutable relay section, next to `hopCount`; the immutable signed header, ciphertext and author signature are unchanged, so relays still never decrypt or re-encrypt. The field is additive for protocol v1 (older builds ignore it, the v1 golden vectors stay valid) and costs roughly one hop's worth of payload per relay, which caps practical journeys well below the 2,880-character limit.

## Considered Options

- **Device-local history only**: no protocol change, but no device can show who carried a packet, so the journey would be guesswork.
- **Unsigned relay list**: same size saving, but any relay could invent or rewrite it.
