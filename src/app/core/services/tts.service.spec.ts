import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { TtsService } from './tts.service';

describe('TtsService', () => {
  let service: TtsService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [TtsService]
    });
    service = TestBed.inject(TtsService);
  });

  it('should automatically switch to native TTS mode and split chunks when audioUrl is empty', async () => {
    await service.loadChapterMedia({
      chapterId: 'ch_balabodha',
      langCode: 'hi',
      ttsLocale: 'hi-IN',
      audioUrl: '',
      transcript: 'प्रथम श्लोक यहाँ है।\nद्वितीय श्लोक यहाँ है।'
    });

    const state = await firstValueFrom(service.playerState$);
    expect(state.mode).toBe('tts');
    expect(state.isPlaying).toBeFalse();
    expect(state.duration).toBe(2);
    expect(state.activeChunkText).toBe('प्रथम श्लोक यहाँ है।');
  });

  it('should seek accurately across TTS sentence chunks and update playback rate', async () => {
    await service.loadChapterMedia({
      chapterId: 'ch_balabodha',
      langCode: 'hi',
      ttsLocale: 'hi-IN',
      audioUrl: '',
      transcript: 'Sentence one.\nSentence two.\nSentence three.'
    });

    await service.seekTo(2);
    await service.setPlaybackRate(1.25);

    const state = await firstValueFrom(service.playerState$);
    expect(state.currentTime).toBe(2);
    expect(state.activeChunkText).toBe('Sentence three.');
    expect(state.playbackRate).toBe(1.25);
  });
});
