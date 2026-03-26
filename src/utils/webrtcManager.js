class WebRTCManager {
  constructor(socket) {
    this.socket = socket;
    this.peers = new Map();
    this.streams = new Map();
    this.pendingCandidates = new Map();
    this.screenStream = null;
    this.isScreenSharing = false;
    this.screenShareEndedCallback = null;
  }

  async replaceOutgoingVideoTrack(track) {
    const replaceTasks = [];
    for (const [, peer] of this.peers) {
      const sender = peer.getSenders().find((s) => s.track && s.track.kind === 'video');
      if (sender) {
        replaceTasks.push(sender.replaceTrack(track || null));
      }
    }
    await Promise.allSettled(replaceTasks);
  }

  flushPendingCandidates(peerId) {
    const peer = this.peers.get(peerId);
    const queued = this.pendingCandidates.get(peerId);
    if (!peer || !queued || queued.length === 0) {
      return;
    }

    console.log(`Flushing ${queued.length} queued ICE candidate(s) for ${peerId}`);
    queued.forEach((candidate) => {
      peer.addIceCandidate(new RTCIceCandidate(candidate)).catch((err) => {
        console.warn('Queued ICE candidate error:', err.message);
      });
    });
    this.pendingCandidates.delete(peerId);
  }

  async getLocalStream(constraints = { audio: true, video: true }) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      return stream;
    } catch (error) {
      console.error('Error getting user media:', error);
      throw error;
    }
  }

  createPeer(initiator, stream, peerId, onStream, onSignal) {
    try {
      console.log('Creating PeerConnection - initiator:', initiator, 'hasStream:', !!stream);
      
      const config = {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ]
      };

      const peerConnection = new RTCPeerConnection(config);
      console.log('RTCPeerConnection created successfully');

      // Keep a per-peer signal sender so offer/answer/ICE all use the same transport path.
      peerConnection.__onSignal = onSignal;

      // Add local stream
      if (stream) {
        stream.getTracks().forEach(track => {
          peerConnection.addTrack(track, stream);
        });
        console.log('Added local tracks to peer connection');
      }

      // Handle remote streams
      peerConnection.ontrack = (event) => {
        console.log('Remote track received:', event.track.kind);
        if (event.streams && event.streams[0]) {
          console.log('Remote stream received');
          this.streams.set(peerId, event.streams[0]);
          onStream(event.streams[0]);
        }
      };

      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('Local ICE candidate generated');
          onSignal({
            type: 'iceCandidate',
            candidate: event.candidate
          });
        }
      };

      peerConnection.onconnectionstatechange = () => {
        console.log('Connection state:', peerConnection.connectionState);
      };

      peerConnection.oniceconnectionstatechange = () => {
        console.log('ICE connection state:', peerConnection.iceConnectionState);
      };

      peerConnection.onsignalingstatechange = () => {
        console.log('Signaling state:', peerConnection.signalingState);
      };

      peerConnection.onerror = (error) => {
        console.error('PeerConnection error:', error);
      };

      // Create or answer offer
      if (initiator) {
        console.log('Creating offer (initiator)');
        peerConnection.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true
        }).then(offer => {
          console.log('Offer created, setting local description');
          return peerConnection.setLocalDescription(offer);
        }).then(() => {
          console.log('Local description set, sending offer');
          onSignal({
            type: 'offer',
            sdp: peerConnection.localDescription.sdp
          });
        }).catch(err => {
          console.error('Error creating offer:', err);
        });
      } else {
        console.log('Waiting for offer (non-initiator)');
      }

      this.peers.set(peerId, peerConnection);
      console.log('Peer stored, total peers:', this.peers.size);
      
      return peerConnection;
    } catch (error) {
      console.error('PeerConnection creation failed:', error);
      throw error;
    }
  }

  addIceCandidate(peerId, candidate) {
    try {
      const peer = this.peers.get(peerId);
      if (peer && candidate) {
        // Queue candidates until remote SDP is set to avoid InvalidStateError.
        if (!peer.remoteDescription || !peer.remoteDescription.type) {
          const queued = this.pendingCandidates.get(peerId) || [];
          queued.push(candidate);
          this.pendingCandidates.set(peerId, queued);
          console.log(`Queued ICE candidate for ${peerId}, total queued: ${queued.length}`);
          return;
        }

        peer.addIceCandidate(new RTCIceCandidate(candidate)).catch(err => {
          console.warn('ICE candidate error:', err.message);
        });
      }
    } catch (error) {
      console.error('addIceCandidate error:', error);
    }
  }

  signal(peerId, signal) {
    try {
      const peer = this.peers.get(peerId);
      if (!peer) {
        console.warn('Peer not found for signal:', peerId);
        return;
      }

      if (signal.type === 'offer') {
        if (peer.signalingState !== 'stable') {
          console.warn('Ignoring offer because peer is not stable:', peer.signalingState);
          return;
        }

        console.log('Received offer, creating answer');
        peer.setRemoteDescription(new RTCSessionDescription({
          type: 'offer',
          sdp: signal.sdp
        })).then(() => {
          this.flushPendingCandidates(peerId);
          console.log('Remote offer set, creating answer');
          return peer.createAnswer();
        }).then(answer => {
          console.log('Answer created, setting local description');
          return peer.setLocalDescription(answer);
        }).then(() => {
          console.log('Answer sent');
          if (typeof peer.__onSignal === 'function') {
            peer.__onSignal({
              type: 'answer',
              sdp: peer.localDescription.sdp
            });
          } else {
            console.warn('No onSignal callback found for peer while sending answer');
          }
        }).catch(err => {
          console.error('Error handling offer:', err);
        });
      } else if (signal.type === 'answer') {
        if (peer.signalingState !== 'have-local-offer') {
          console.warn('Ignoring answer in unexpected signaling state:', peer.signalingState);
          return;
        }

        console.log('Received answer');
        peer.setRemoteDescription(new RTCSessionDescription({
          type: 'answer',
          sdp: signal.sdp
        })).then(() => {
          this.flushPendingCandidates(peerId);
        }).catch(err => {
          console.error('Error setting answer:', err);
        });
      } else if (signal.type === 'iceCandidate') {
        console.log('Received ICE candidate');
        this.addIceCandidate(peerId, signal.candidate);
      }
    } catch (error) {
      console.error('signal error:', error);
    }
  }

  getRemoteStream(peerId) {
    return this.streams.get(peerId);
  }

  toggleAudio(stream, enabled) {
    if (stream) {
      stream.getAudioTracks().forEach((track) => {
        track.enabled = enabled;
      });
    }
  }

  toggleVideo(stream, enabled) {
    if (stream) {
      stream.getVideoTracks().forEach((track) => {
        track.enabled = enabled;
      });
    }
  }

  endPeerCall(peerId) {
    try {
      const peer = this.peers.get(peerId);
      if (peer) {
        peer.close();
        this.peers.delete(peerId);
      }
      this.streams.delete(peerId);
      this.pendingCandidates.delete(peerId);
    } catch (error) {
      console.error('endPeerCall error:', error);
    }
  }

  endAllCalls() {
    try {
      this.peers.forEach((peer) => {
        try {
          peer.close();
        } catch (err) {
          console.error('Error closing peer:', err);
        }
      });
      this.peers.clear();
      this.streams.clear();
      this.pendingCandidates.clear();
      if (this.screenStream) {
        this.screenStream.getTracks().forEach((track) => {
          try {
            track.onended = null;
            track.stop();
          } catch (err) {
            console.error('Error stopping screen track:', err);
          }
        });
      }
      this.screenStream = null;
      this.isScreenSharing = false;
      this.screenShareEndedCallback = null;
      console.log('All peers closed');
    } catch (error) {
      console.error('endAllCalls error:', error);
    }
  }

  stopLocalStream(stream) {
    if (stream) {
      stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (err) {
          console.error('Error stopping track:', err);
        }
      });
    }
  }

  async toggleScreenShare(localStream, share, onEnded) {
    try {
      if (share) {
        if (this.isScreenSharing) {
          return this.screenStream;
        }

        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];

        if (!screenTrack) {
          throw new Error('No screen track received from display media');
        }

        await this.replaceOutgoingVideoTrack(screenTrack);

        this.screenStream = screenStream;
        this.isScreenSharing = true;
        this.screenShareEndedCallback = typeof onEnded === 'function' ? onEnded : null;

        screenTrack.onended = async () => {
          await this.toggleScreenShare(localStream, false);
          if (typeof this.screenShareEndedCallback === 'function') {
            this.screenShareEndedCallback();
          }
        };

        return screenStream;
      }

      const cameraTrack = localStream?.getVideoTracks?.()[0] || null;
      await this.replaceOutgoingVideoTrack(cameraTrack);

      if (this.screenStream) {
        this.screenStream.getTracks().forEach((track) => {
          track.onended = null;
          track.stop();
        });
      }

      this.screenStream = null;
      this.isScreenSharing = false;
      this.screenShareEndedCallback = null;

      return null;
    } catch (error) {
      console.error('Screen share error:', error);
      return null;
    }
  }
}

export default WebRTCManager;
