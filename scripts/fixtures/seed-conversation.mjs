// A long conversation between the seeded coach and Alice Adams, written to the
// LOCAL Firestore emulator the way an admin would (it bypasses the rules).
// Used by the browser tests for the message screens. Message i (1-based) reads
// "Message i: ...", sent alternately by the coach (odd) and the athlete (even).

const FS = "http://127.0.0.1:8080/v1/projects/demo-ballmasters/databases/(default)/documents";
const OWNER = { "Authorization": "Bearer owner", "content-type": "application/json" };
const str = v => ({ stringValue: v });
const ts = ms => ({ timestampValue: new Date(ms).toISOString() });

async function patch(path, fields) {
  const res = await fetch(`${FS}/${path}`, { method: "PATCH", headers: OWNER, body: JSON.stringify({ fields }) });
  if (!res.ok) throw new Error(`seed ${path}: ${res.status} ${await res.text()}`);
}

export async function seedConversation(seeded, messages = 70, { videoMessage = null } = {}) {
  const aliceUid = seeded.athletes["Alice Adams"];
  const tid = `${seeded.coachUid}__${aliceUid}`;
  const t0 = Date.now() - messages * 60_000;
  await patch(`threads/${tid}`, {
    coachId: str(seeded.coachUid), athleteId: str(aliceUid), coachName: str("Coach Carter"), athleteName: str("Alice Adams"),
    athleteAvatarId: str(""), lastMessage: str("last"), lastSenderRole: str("coach"), lastAt: ts(Date.now()),
    unreadForCoach: { integerValue: "0" }, unreadForAthlete: { integerValue: "0" },
  });
  for (let i = 0; i < messages; i++) {
    const fromCoach = i % 2 === 0;
    await patch(`threads/${tid}/messages/m${String(i).padStart(3, "0")}`, {
      senderId: str(fromCoach ? seeded.coachUid : aliceUid),
      senderRole: str(fromCoach ? "coach" : "student"),
      text: str(`Message ${i + 1}: ${fromCoach ? "Nice work on the drill, keep your head up through the finish." : "Thanks coach, I'll film the next set tomorrow."}`),
      videoId: { nullValue: null }, videoTitle: { nullValue: null },
      createdAt: ts(t0 + i * 60_000),
    });
  }
  if (videoMessage) {
    // a final message from the coach that links to a video: { id, title }
    await patch(`threads/${tid}/messages/m999`, {
      senderId: str(seeded.coachUid), senderRole: str("coach"), text: str("Here is your video."),
      videoId: str(videoMessage.id), videoTitle: str(videoMessage.title),
      createdAt: ts(Date.now()),
    });
  }
  return { tid, aliceUid };
}
