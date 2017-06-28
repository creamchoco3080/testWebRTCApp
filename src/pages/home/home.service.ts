import {Injectable} from '@angular/core';
import {Platform} from 'ionic-angular';
import {Subject, Observable} from 'rxjs';
import * as io from 'socket.io-client';


@Injectable()
export class HomeService {
  isChannelReady: boolean;
  isInitiator: boolean;
  isStarted: boolean;

  requestSent: boolean;

  sdpOffer: RTCSessionDescription;

  pc: RTCPeerConnection;

  localStream: MediaStream;
  remoteStream: MediaStream;

  sendChannel;
  sendChannelText: string;
  receiveChannel;
  receiveChannelText: Subject<string>;

  remoteStreamObservable: Observable<MediaStream>;
  remoteStreamSubject: Subject<MediaStream>;

  offerOptions = {
    offerToReceiveVideo: 1,
    offerToReceiveAudio: 0
  };

  videoConstraints = {
    video: {width: {exact: 320}, height: {exact: 240}}
  };



  room = 'randomroom';
  socket = io.connect('http://10.0.1.19:3000');

  constructor(private platform: Platform,) {
    this.isChannelReady = false;
    this.isInitiator = false;
    this.isStarted = false;
    this.requestSent = false;
    this.remoteStreamSubject = new Subject<MediaStream>();
    this.remoteStreamObservable = this.remoteStreamSubject.asObservable();
    this.receiveChannelText = new Subject<string>();
    (<any>window).send = this.sendChannel;
  }

  startCanvas(): Promise<MediaStream>{
    return new Promise(resolve =>{
      var canvas = document.querySelector('canvas');
      resolve(this.localStream = (<any>canvas).captureStream());
    });
  }

  startVideo(): Promise<MediaStream> {
    if (!navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia = (<any> navigator).webkitGetUserMedia;
      return new Promise(resolve => {
        (<any> navigator).webkitGetUserMedia({video: true, audio: false},
          (stream) => {
            resolve(this.localStream = stream)
          },
          () => {
            console.log("GUM failed")
          });
      });
    }

    return navigator.mediaDevices.getUserMedia({video: true, audio: false})
      .then(stream => this.localStream = stream)
      .catch(err => console.log('MyError',err));
  }

  sendMessage(message: any) {
    this.socket.emit('message', message);
  }

  getMessage() {
    this.socket.on('message', (message) => {
      console.log('got message: ', message);
      if (message.type == 'offer') {
        this.sdpOffer = message;
        if (this.isStarted) {
          this.pc.setRemoteDescription(new RTCSessionDescription(message));
          console.log('answer');
          this.answer();
        }
      } else if (message.type == 'answer' && this.isStarted) {
        this.pc.setRemoteDescription(new RTCSessionDescription(message));
      } else if (message.type == 'candidate' && this.isStarted) {
        var candidate = new RTCIceCandidate({
          sdpMLineIndex: message.label,
          candidate: message.candidate
        });
        this.pc.addIceCandidate(candidate);
      } else if (message == 'bye' && this.isStarted) {
        this.handleRemoteTerminate();
      } else if (message == 'remote stream added') {
        console.log('==============')
      }
    });
  }

  getIO() {
    if (this.room !== '') {
      this.socket.emit('create or join', this.room);
      console.log('Attempted to create or join room', this.room);
    }
    let observable = new Observable((observer) => {
      this.socket.on('created', function (room) {
          console.log('Created room ' + room);
          console.log('this: ', this);
          this.isInitiator = true;
        }
      );

      this.socket.on('full', function (room) {
        console.log('Room ' + room + ' is full');
      });

      this.socket.on('join', function (room) {
        console.log('Another peer made a request to join room ' + room);
        console.log('This peer is the initiator of room ' + room + '!');
        observer.next('isInitiator');
      });

      this.socket.on('joined', function (room) {
        console.log('joined: ' + room);
        console.log('this : ', this);
        observer.next('isChannelReady');
      });
    });

    return observable;
  }

  checkIosCondition() {
    console.log(this.isStarted, this.isChannelReady, this.pc);
    if (!this.requestSent && this.isStarted && this.isChannelReady) {
      this.requestSent = true;
      if (this.isInitiator)
        this.offer();
      else {
        this.pc.setRemoteDescription(new RTCSessionDescription(this.sdpOffer));
        this.answer();
      }
    }
  }

  checkCondition() {
    console.log(this.isStarted, this.isChannelReady, this.pc);
    if (!this.requestSent && this.isStarted && (typeof this.localStream != null) && this.isChannelReady) {
      this.requestSent = true;
      if (this.isInitiator)
        this.offer();
      else {
        this.pc.setRemoteDescription(new RTCSessionDescription(this.sdpOffer));
        this.answer();
      }
    }
  }

  createPC() {
    console.log('Create peer connection');

    var server = null;
    try {
      (<any>window).pc = this.pc = new RTCPeerConnection(server)
    }
    catch (err) {
      (<any>window).pc = this.pc = new webkitRTCPeerConnection(server);
    }

    console.log(this.pc);

    this.pc.onicecandidate = (event) => this.handleICE(event);

    // if(this.platform.is('ios')){
    //   console.log('Trying to install ontrack handler');
    //   (<any>window).ontrack = (<any> this).pc.ontrack = (event) => {
    //     console.log("ontrack called");
    //     this.remoteStream = event.streams[0];
    //     this.remoteStreamSubject.next(this.remoteStream);
    //   }
    // }
    // else{
      console.log('Trying to install onaddstream handler');
      this.pc.onaddstream = (event) => {
        console.log('onaddstream called: ', event);
        this.handleRemoteAddStream(event);
      }
    // }


    this.isStarted = true;
    if(!this.platform.is('ios')){
      console.log('this.localStream: ', this.localStream);
      this.pc.addStream(this.localStream);
    }
    else{
      // var stream = new MediaStream();
      // console.log('empty mediastream: ', stream);
      console.log(this.localStream);
      this.pc.addStream(this.localStream);
    }

    // create data channel & install handlers
    (<any> window).sendChannel = this.sendChannel = (<any>this.pc).createDataChannel('sendDataChannel');

    (<any>window).datachannel = (<any>this.pc).ondatachannel = (event) => {
      this.receiveChannel = event.channel;
      this.receiveChannel.onmessage = (event) => {
        console.log('message received');
        this.receiveChannelText.next(event.data);
      }
    };

    this.sendChannel.onopen = (event) => {
      console.log('sendChannel opened: ', event);
      return this.onSendChannelStateChange();
    };
    this.sendChannel.onclose = (event) => {
      console.log('sendChannel closed: ', event);
      return this.onSendChannelStateChange;
    };

    this.checkCondition();
  }

  onSendChannelStateChange() {
    var readyState = this.sendChannel.readyState;
    console.log('Send data channel state is: ' + readyState);
  }

  sendData(text: string) {
    this.sendChannel.send(text);
    this.receiveChannelText.next(text);
    console.log('Send data: ' + text);
  }

  onReceiveChannelStateChange() {
    var readyState = this.receiveChannel.readyState;
    console.log('Receive channel state is: ' + readyState);
  }

  receiveChannelCallback(event) {
    console.log('create receivechannel', event);
    this.receiveChannel = event.stream;
    this.receiveChannel.onmessage = (event) => {
      this.onReceiveMessageCallback
    };
  }

  onReceiveMessageCallback(event) {
    console.log('message received');
    this.receiveChannelText.next(event.data);
  }

  offer() {
    console.log('sent offer');
    this.pc.createOffer().then(sdp => this.setSDP(sdp)).catch(err => console.log(err));
    // this.pc.createOffer(sdp => this.setSDP(sdp),err => console.log(err),{offerToReceiveAudio: 1, offerToReceiveVideo: 1});
  }

  answer() {
    console.log('sent answer')
    this.pc.createAnswer().then(sdp => this.setSDP(sdp)).catch(err => console.log(err));
  }

  setSDP(sdp): void {
    console.log('setSDP: ', sdp);
    this.pc.setLocalDescription(sdp)
      .then(() => {
        console.log('set local description success');
        this.socket.emit('message', sdp);
      }).catch(() => {
      console.log('set local description error')
    });
  }

  handleICE(event) {
    console.log('handleICE called');
    if (event.candidate) {
      this.sendMessage({
        type: 'candidate',
        label: event.candidate.sdpMLineIndex,
        id: event.candidate.sdpMid,
        candidate: event.candidate.candidate
      });
    }
  }

  handleRemoteAddStream(event) {
    console.log('handleRemoteAddStream called');
    (<any> window).remoteStream =  this.remoteStream = event.stream;
    console.log(this.remoteStream);
    this.remoteStreamSubject.next(this.remoteStream);
    this.socket.emit('message', 'remote stream added');
  }

  localTerminate() {
    this.terminate();
    this.sendMessage('bye');
  }

  handleRemoteTerminate() {
    this.terminate();
    this.isInitiator = false;
  }

  terminate() {
    this.isStarted = false;
    this.pc.close();
    this.pc = null;
  }

  disconnect() {
    this.socket.disconnect(true);
  }
}
