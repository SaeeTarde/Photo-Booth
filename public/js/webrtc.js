const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

export async function startCall({ socket, localVideo, remoteVideo, onState }) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480, facingMode: 'user' },
     audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  localVideo.srcObject = stream;

  let pc;
  let pendingCandidates = [];

  function makePeer() {
    pendingCandidates = [];
    pc = new RTCPeerConnection(ICE);
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));

    pc.ontrack = (e) => { remoteVideo.srcObject = e.streams[0]; };
    pc.onicecandidate = (e) => {
      if (e.candidate) socket.send('ice', { candidate: e.candidate });
    };
    pc.onconnectionstatechange = () => onState?.(pc.connectionState);
  }

  async function flushCandidates() {
    for (const c of pendingCandidates) await pc.addIceCandidate(c).catch(console.error);
    pendingCandidates = [];
  }

  makePeer();

  // The person already in the room creates the offer when a partner arrives
  socket.on('peer-joined', async () => {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.send('offer', { sdp: pc.localDescription });
  });

  socket.on('offer', async ({ sdp }) => {
    await pc.setRemoteDescription(sdp);
    await flushCandidates();
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.send('answer', { sdp: pc.localDescription });
  });

  socket.on('answer', async ({ sdp }) => {
    await pc.setRemoteDescription(sdp);
    await flushCandidates();
  });

  // ICE candidates can arrive before the remote description is set, so queue them
  socket.on('ice', async ({ candidate }) => {
    if (pc.remoteDescription) await pc.addIceCandidate(candidate).catch(console.error);
    else pendingCandidates.push(candidate);
  });

  // Partner left: throw the old connection away so a new partner can connect
  socket.on('peer-left', () => {
    pc.close();
    remoteVideo.srcObject = null;
    makePeer();
  });

  return { stream };
}