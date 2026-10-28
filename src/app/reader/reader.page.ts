import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { NgIf } from '@angular/common';
import { DataService } from '../../core/services/data.service';
import { StorageService } from '../../core/services/storage.service';
import { TtsService } from '../../core/services/tts.service';

@Component({
 selector: 'app-reader-page',
 standalone: true,
 imports: [IonicModule, NgIf],
 template: `
 <ion-header>
 <ion-toolbar>
 <ion-buttons slot="start">
 <ion-back-button defaultHref="/dashboard" />
 </ion-buttons>

 <ion-title>{{ chapter?.title?.[language] }}</ion-title>

 <ion-buttons slot="end">
 <ion-button (click)="toggleBookmark()">
 {{ bookmarked ? '⭐' : '☆' }}
 </ion-button>
 </ion-buttons>
 </ion-toolbar>
 </ion-header>

 <ion-content *ngIf="chapter">
 <article class="reader-text ion-padding">
 {{ chapter.transcript[language] }}
 </article>

 <div class="audio-dock">
 <audio
 *ngIf="chapter.audioPath"
 [src]="chapter.audioPath"
 controls
 preload="metadata"
 ></audio>

 <ion-button
 *ngIf="!chapter.audioPath"
 expand="block"
 (click)="speak()"
 >
 Listen with text-to-speech
 </ion-button>
 </div>
 </ion-content>
 `
})
export class ReaderPage implements OnInit {
 chapter: any;
 language = 'en';
 bookmarked = false;

 constructor(
 private route: ActivatedRoute,
 private dataService: DataService,
 private storage: StorageService,
 private tts: TtsService
 ) {}

 async ngOnInit(): Promise<void> {
 const bookId = this.route.snapshot.paramMap.get('bookId');
 const chapterId = this.route.snapshot.paramMap.get('chapterId');

 const book = this.dataService.currentConfig?.books.find(
 item => item.id === bookId
 );

 this.chapter = book?.chapters.find(
 item => item.id === chapterId
 );

 this.language =
 (await this.storage.getLanguage()) ??
 this.dataService.currentConfig?.supportedLanguages
.find(item => item.enabled)?.code ??
 'en';

 const bookmarks = await this.storage.getBookmarks();
 this.bookmarked = bookmarks.includes(chapterId ?? '');
 }

 async toggleBookmark(): Promise<void> {
 if (!this.chapter) {
 return;
 }

 const bookmarks = await this.storage.toggleBookmark(this.chapter.id);
 this.bookmarked = bookmarks.includes(this.chapter.id);
 }

 async speak(): Promise<void> {
 if (!this.chapter) {
 return;
 }

 await this.tts.speak(
 this.chapter.transcript[this.language],
 this.language
 );
 }
}
