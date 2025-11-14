'use client';

import { useState, useRef } from 'react';

interface VoiceInputButtonProps {
  onTranscript: (text: string) => void;
  language?: 'de' | 'en';
  disabled?: boolean;
}

export default function VoiceInputButton({
  onTranscript,
  language = 'de',
  disabled = false
}: VoiceInputButtonProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      // Collect audio data
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      // Handle recording stop
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

        // Stop all tracks to release microphone
        stream.getTracks().forEach(track => track.stop());

        // Send to backend
        await sendToWhisper(audioBlob);
      };

      // Start recording
      mediaRecorder.start();
      setIsRecording(true);
      console.log('🎤 Recording started...');

    } catch (error) {
      console.error('❌ Microphone access error:', error);
      alert('Fehler beim Zugriff auf das Mikrofon. Bitte Berechtigungen prüfen.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsProcessing(true);
      console.log('🎤 Recording stopped, processing...');
    }
  };

  const sendToWhisper = async (audioBlob: Blob) => {
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');
      formData.append('language', language);

      console.log('📤 Sending audio to server...', {
        size: audioBlob.size,
        type: audioBlob.type,
        language
      });

      const response = await fetch('/api/voice-to-text', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Transcription failed');
      }

      const result = await response.json();
      console.log('✅ Transcription result:', result.text);

      if (result.text) {
        onTranscript(result.text);
      } else {
        alert('Keine Sprache erkannt. Bitte erneut versuchen.');
      }

    } catch (error) {
      console.error('❌ Transcription error:', error);
      alert(`Fehler bei der Spracherkennung: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleToggle = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <button
      onClick={handleToggle}
      disabled={disabled || isProcessing}
      className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-all ${
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
          : 'Sprachnachricht aufnehmen'
      }
    >
      {isRecording ? (
        <>
          <span className="text-lg">⏹️</span>
          <span>Stoppen</span>
        </>
      ) : isProcessing ? (
        <>
          <span className="text-lg">⏳</span>
          <span>Verarbeite...</span>
        </>
      ) : (
        <>
          <span className="text-lg">🎤</span>
          <span>Aufnehmen</span>
        </>
      )}
    </button>
  );
}
