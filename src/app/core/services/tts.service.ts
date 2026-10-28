import { Injectable } from '@angular/core';
import { TextToSpeech } from '@capacitor-community/text-to-speech';

@Injectable({ providedIn: 'root' })
export class TtsService {
 async speak(text: string, language: string): Promise<void> {
 await TextToSpeech.stop();

 await TextToSpeech.speak({
 text,
 lang: language,
 rate: 0.9,
 pitch: 1,
 volume: 1,
 category: 'playback'
 });
 }

 async stop(): Promise<void> {
 await TextToSpeech.stop();
 }

 async pause(): Promise<void> {
 await TextToSpeech.pause();
 }

 async resume(): Promise<void> {
 await TextToSpeech.resume();
 }
}
