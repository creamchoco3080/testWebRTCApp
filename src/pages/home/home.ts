import { Component, OnInit, OnDestroy } from '@angular/core';
import { HomeService } from './home.service';
import { Diagnostic } from '@ionic-native/diagnostic';
import { Platform } from 'ionic-angular';

declare var cordova: any;

@Component({
  selector: 'page-home',
  templateUrl: 'home.html'
})
export class HomePage implements OnInit, OnDestroy {

  localMediaStream: MediaStream;
  remoteMediaStream: MediaStream;

  iosPlatform: boolean;

  sendDataText: string;

  chat: string[];

  constructor(private homeService: HomeService, private diagnostic: Diagnostic, private platform: Platform) {
    this.iosPlatform = this.platform.is('ios')
    this.chat = [];
    this.homeService.getMessage();
    this.homeService.getIO().subscribe((msg) => {
      console.log(msg);
      if (msg == 'isChannelReady') {
        this.homeService.isChannelReady = true;
        this.homeService.checkCondition();
      }
      else if (msg == 'isInitiator') {
        this.homeService.isInitiator = true;
        this.homeService.isChannelReady = true;
        this.homeService.checkCondition();
      }
    });
    this.homeService.remoteStreamObservable.subscribe(rms => {
      console.log('rms: ', rms);
      this.remoteMediaStream = rms
    },(err)=>console.log("error:",err));
    this.homeService.receiveChannelText.subscribe(msg => {
      console.log('homeService.receiveChannelText emits', msg);
      this.chat.push(msg);
    },(err)=>console.log("error:",err));
    setInterval(()=>{}, 500);
  }

  sendData() {
    this.homeService.sendData(this.sendDataText);
    this.sendDataText = '';
  }


  disconnect() {
    this.homeService.disconnect();
  }

  ngOnInit() {
    console.log('ngOnInit called');
    this.platform.ready().then(()=>{
      // If the app is running as a mobile app
      if(this.platform.is('cordova')){
        // If the platform is iOS, don't get the camera. TODO: remove this when testing on a real device
        if(this.platform.is('ios')){
          this.diagnostic.getCameraAuthorizationStatus().then((status)=>{
            console.log(status);
            if(status == 'not_determined'){
              this.diagnostic.requestCameraAuthorization(true).then((status)=>{
                console.log(status);
                this.homeService.startVideo().then((stream)=>{
                  (<any> window).localMediaStream = this.localMediaStream = stream;
                  this.homeService.createPC();
                  this.homeService.checkCondition();
                })
              });
            }
            else{
              this.homeService.startVideo().then((stream)=>{
                (<any> window).localMediaStream = this.localMediaStream = stream;
                this.homeService.createPC();
                this.homeService.checkCondition();
              });
            }
          })
        }
        // If the platform is Android, ask for camera permission and start the video.
        else{
          this.diagnostic.getCameraAuthorizationStatus().then((status)=>{
            console.log(status);
            if(status == 'NOT_REQUESTED'){
              this.diagnostic.requestCameraAuthorization(true).then((status)=>{
                console.log(status);
                this.homeService.startVideo().then((stream) => {
                  console.log('got user media stream');
                  this.localMediaStream = stream;
                  this.homeService.createPC();
                  this.homeService.checkCondition();
                });
              });
            }
            else{
              this.homeService.startVideo().then((stream) => {
                console.log('got user media stream');
                this.localMediaStream = stream;
                this.homeService.createPC();
                this.homeService.checkCondition();
              });
            }
          });
        }
      }
      // If the test app is running as a web app, start the video.
      else{
        this.homeService.startVideo().then((stream) => {
          console.log('got user media stream');
          this.localMediaStream = stream;
          this.homeService.createPC();
          this.homeService.checkCondition();
        });
      }
    });
  }

  ngOnDestroy() {
    this.disconnect();
  }

}
