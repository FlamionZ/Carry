# CARRY

Offline coordination for private communities: announcements are created on one phone, carried by members as QR frames, and confirmed when an acknowledgement is carried back.

## Community and membership

**Community**:
A private group whose members share one community key and whose membership is issued by one administrator.
_Avoid_: Group, channel, network, mesh

**Administrator**:
The member who created the community and alone approves new members.
_Avoid_: Owner, host, organizer (as a role)

**Member**:
A person whose device holds an administrator-signed membership certificate for the community.
_Avoid_: User, participant, contact, peer

**Invitation**:
A single-use, short-lived QR that lets one person request to join; it never contains the community key.
_Avoid_: Invite link, join code

**Join request**:
The QR a prospective member shows the administrator after scanning an invitation.

**Approval**:
The QR the administrator shows a requester, carrying that device's membership certificate and the community key encrypted for that device only.
_Avoid_: Acceptance, admission

## Messages

**Message**:
A short, signed, encrypted text a member writes for the whole community.
_Avoid_: Chat, post, broadcast

**Message kind**:
One of Announcement, Change or Request, chosen by the author and visible only to members.

**Announcement**:
A message that shares general information with the community.

**Change**:
A message that moves a time or a place, including a meeting point.
_Avoid_: Location update, meeting point change (as separate kinds)

**Request**:
A message that asks members for something; members answer by acknowledging it.
_Avoid_: Reply, task

**Acknowledgement**:
A signed packet a member creates to confirm they received a specific message; it counts only once scanned on the author's device.
_Avoid_: ACK (in user-facing text), read receipt, delivery receipt

## Carrying

**Packet**:
The signed, encrypted unit that moves between devices: a message or an acknowledgement.
_Avoid_: Envelope (in user-facing text), payload

**Frame**:
One QR code in the ordered sequence that together shows one packet.
_Avoid_: Slide, page, chunk (in user-facing text)

**Transfer**:
One showing of a packet's frames, collected by one scanning device until complete.

**Relay**:
Showing a received packet unchanged to the next person, so it travels one more hop.
_Avoid_: Forward, share, broadcast

**Hop**:
One relay of a packet from one member's device to the next.

**Relay entry**:
A relay's signed statement, added to a packet, that this member carried it one hop.

**Relay journey**:
The verified sequence of members a packet passed through, as known to the device showing it.
_Avoid_: Route, path map, network map

**Unknown member**:
A relay whose identity this device cannot verify, because it has never seen that member's certificate.
_Avoid_: Anonymous relay, stranger

**Unrecorded journey**:
The journey of a packet that carries no relay entries, so only its hop count is known.

**Ledger**:
The per-community history of this device's own messages, their relay journeys and the acknowledgements that came back.
_Avoid_: Log, dashboard

## Status on a device

A status describes only what this device has observed; no device knows a packet's status elsewhere.

**Created**:
This device wrote the message and has not shown it yet.

**Shown**:
This device displayed its own packet as frames; whether anyone scanned it is unknown.
_Avoid_: Sent, delivered, exported

**Received**:
This device scanned, verified and stored a packet from someone else.
_Avoid_: Delivered, read

**Shown for relay**:
This device displayed a received packet for the next hop.
_Avoid_: Relayed (as a status), forwarded

**Acknowledged**:
An acknowledgement of this device's own message was scanned here.
_Avoid_: Delivered, read

**Expired**:
The packet's expiry passed; it can no longer be shown or relayed.

A packet that fails verification is not a status: it is rejected at scan time, the scan page shows the error message and code, and the packet is never stored or shown.
