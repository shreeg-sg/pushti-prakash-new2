import {
  WebPlugin
} from "./chunk-3FBKLQLS.js";
import {
  __async
} from "./chunk-WDMUDEB6.js";

// node_modules/@capacitor-community/text-to-speech/dist/esm/web.js
var TextToSpeechWeb = class extends WebPlugin {
  constructor() {
    super();
    this.speechSynthesis = null;
    if ("speechSynthesis" in window) {
      this.speechSynthesis = window.speechSynthesis;
      window.addEventListener("beforeunload", () => {
        this.stop();
      });
    }
  }
  speak(options) {
    return __async(this, null, function* () {
      if (!this.speechSynthesis) {
        this.throwUnsupportedError();
      }
      yield this.stop();
      const speechSynthesis = this.speechSynthesis;
      const utterance = this.createSpeechSynthesisUtterance(options);
      return new Promise((resolve, reject) => {
        utterance.onend = () => {
          resolve();
        };
        utterance.onerror = (event) => {
          reject(event);
        };
        speechSynthesis.speak(utterance);
      });
    });
  }
  stop() {
    return __async(this, null, function* () {
      if (!this.speechSynthesis) {
        this.throwUnsupportedError();
      }
      this.speechSynthesis.cancel();
    });
  }
  getSupportedLanguages() {
    return __async(this, null, function* () {
      const voices = this.getSpeechSynthesisVoices();
      const languages = voices.map((voice) => voice.lang);
      const filteredLanguages = languages.filter((v, i, a) => a.indexOf(v) == i);
      return {
        languages: filteredLanguages
      };
    });
  }
  getSupportedVoices() {
    return __async(this, null, function* () {
      const voices = this.getSpeechSynthesisVoices();
      return {
        voices
      };
    });
  }
  isLanguageSupported(options) {
    return __async(this, null, function* () {
      const result = yield this.getSupportedLanguages();
      const isLanguageSupported = result.languages.includes(options.lang);
      return {
        supported: isLanguageSupported
      };
    });
  }
  openInstall() {
    return __async(this, null, function* () {
      this.throwUnimplementedError();
    });
  }
  createSpeechSynthesisUtterance(options) {
    const voices = this.getSpeechSynthesisVoices();
    const utterance = new SpeechSynthesisUtterance();
    const {
      text,
      lang,
      rate,
      pitch,
      volume,
      voice
    } = options;
    if (voice !== void 0) {
      utterance.voice = voices[voice];
    }
    if (volume !== void 0) {
      utterance.volume = volume >= 0 && volume <= 1 ? volume : 1;
    }
    if (rate !== void 0) {
      utterance.rate = rate >= 0.1 && rate <= 10 ? rate : 1;
    }
    if (pitch !== void 0) {
      utterance.pitch = pitch >= 0 && pitch <= 2 ? pitch : 2;
    }
    if (lang) {
      utterance.lang = lang;
    }
    utterance.text = text;
    return utterance;
  }
  getSpeechSynthesisVoices() {
    if (!this.speechSynthesis) {
      this.throwUnsupportedError();
    }
    if (!this.supportedVoices || this.supportedVoices.length < 1) {
      this.supportedVoices = this.speechSynthesis.getVoices();
    }
    return this.supportedVoices;
  }
  throwUnsupportedError() {
    throw this.unavailable("SpeechSynthesis API not available in this browser.");
  }
  throwUnimplementedError() {
    throw this.unimplemented("Not implemented on web.");
  }
};
export {
  TextToSpeechWeb
};
//# sourceMappingURL=web-PDB7LVNH.js.map
