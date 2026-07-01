'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface VoiceInputButtonProps {
  onTranscript: (text: string) => void;
  language?: 'de' | 'en';
  disabled?: boolean;
  compact?: boolean;
}

type SpeechProvider = 'web-speech' | 'whisper';

function getProvider(): SpeechProvider {
  if (typeof window === 'undefined') return 'web-speech';
  return (localStorage.getItem('speech-provider') as SpeechProvider) || 'web-speech';
}

function hasWebSpeechAPI(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

interface SpeechRecognitionEvent {
  results: { [index: number]: { [index: number]: { transcript: string } } };
}

interface SpeechRecognitionErrorEvent {
  error: string;
}

interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: { new(): SpeechRecognitionInstance };
    webkitSpeechRecognition: { new(): SpeechRecognitionInstance };
  }
}

export default function VoiceInputButton({
  onTranscript,
  language = 'de',
  disabled = false,
  compact = false,
}: VoiceInputButtonProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [unsupported, setUnsupported] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const langTag = language === 'en' ? 'en-US' : 'de-DE';

  const startWebSpeech = useCallback(() => {
    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      setUnsupported(true);
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = langTag;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript;
      if (transcript) {
        onTranscript(transcript);
      } else {
        alert('Keine Sprache erkannt. Bitte erneut versuchen.');
      }
    };

    recognition.onerror = (event) => {
      if (event.error === 'not-allowed') {
        alert('Mikrofon-Zugriff verweigert. Bitte Berechtigungen prüfen.');
      } else if (event.error !== 'aborted' && event.error !== 'no-speech') {
        alert(`Spracherkennung Fehler: ${event.error}`);
      }
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  }, [langTag, onTranscript]);

  const stopWebSpeech = useCallback(() => {
    recognitionRef.current?.stop();
    setIsRecording(false);
  }, []);

  const startWhisper = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(track => track.stop());
        setIsProcessing(true);

        try {
          const formData = new FormData();
          formData.append('audio', audioBlob, 'recording.webm');
          formData.append('language', language);

          const response = await fetch('/api/voice-to-text', {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Transcription failed');
          }

          const result = await response.json();
          if (result.text) {
            onTranscript(result.text);
          } else {
            alert('Keine Sprache erkannt. Bitte erneut versuchen.');
          }
        } catch (error) {
          alert(`Fehler bei der Spracherkennung: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`);
        } finally {
          setIsProcessing(false);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch {
      alert('Fehler beim Zugriff auf das Mikrofon. Bitte Berechtigungen prüfen.');
    }
  }, [language, onTranscript]);

  const stopWhisper = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, []);

  const handleToggle = useCallback(() => {
    if (isRecording) {
      const provider = getProvider();
      if (provider === 'whisper' || !hasWebSpeechAPI()) {
        stopWhisper();
      } else {
        stopWebSpeech();
      }
      return;
    }

    setUnsupported(false);
    const provider = getProvider();

    if (provider === 'whisper') {
      startWhisper();
    } else if (hasWebSpeechAPI()) {
      startWebSpeech();
    } else {
      setUnsupported(true);
    }
  }, [isRecording, startWebSpeech, stopWebSpeech, startWhisper, stopWhisper]);

  return (
    <div className="relative inline-flex">
      <button
        onClick={handleToggle}
        disabled={disabled || isProcessing}
        className={`flex items-center gap-1.5 ${compact ? 'p-1.5' : 'px-3 py-1.5'} text-xs rounded-lg transition-all ${
          isRecording
            ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse'
            : isProcessing
            ? 'bg-slate-600 text-slate-300 cursor-wait'
            : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
        title={
          isRecording
            ? 'Aufnahme stoppen'
            : isProcessing
            ? 'Verarbeite Sprache...'
            : 'Spracheingabe'
        }
      >
        {isRecording ? (
          compact ? <span className="text-sm">⏹️</span> : <>⏹️ Stoppen</>
        ) : isProcessing ? (
          compact ? <span className="text-sm">⏳</span> : <>⏳ Verarbeite...</>
        ) : (
          compact ? <span className="text-sm">🎤</span> : <>🎤 Aufnehmen</>
        )}
      </button>
      {unsupported && (
        <div className="absolute bottom-full left-0 mb-2 w-64 rounded-lg border border-amber-600/40 bg-amber-950 p-2 text-xs text-amber-200 shadow-lg z-50">
          Spracherkennung wird von diesem Browser nicht unterstützt. Bitte Chrome verwenden oder Whisper in den Einstellungen aktivieren.
        </div>
      )}
    </div>
  );
}
